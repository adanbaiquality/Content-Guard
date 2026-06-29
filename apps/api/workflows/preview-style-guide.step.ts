import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

import type {
  AuditResult,
  StoryblokWorkflowWebhookPayload,
} from "../server/audits/index.ts";

const MIN_STRING_LENGTH = 1;
const STORYBLOK_DEFAULT_MANAGEMENT_API_BASE_URL = "https://mapi.storyblok.com/v1";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const aiStyleGroupSchema = z.object({
  ai_output_rule_ids: z.array(z.number()).default([]),
  description: z.string().optional(),
  id: z.number(),
  name: z.string(),
});

const aiStyleGroupsResponseSchema = z.object({
  ai_style_groups: z.array(aiStyleGroupSchema).default([]),
});

const aiOutputRuleSchema = z.object({
  id: z.number(),
  instructions: z.string().optional(),
  name: z.string(),
});

const aiOutputRulesResponseSchema = z.object({
  ai_output_rules: z.array(aiOutputRuleSchema).default([]),
});

const complianceResultSchema = z.object({
  passed: z.boolean().describe("True if the content follows all style guidelines"),
  summary: z.string().describe("Brief summary of the style guide compliance check"),
  violations: z.array(
    z.object({
      excerpt: z.string().optional().describe("The specific text that violates the guideline"),
      explanation: z.string().describe("Why the content violates this guideline"),
      guideline: z.string().describe("The guideline that was violated"),
    }),
  ),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length >= MIN_STRING_LENGTH ? trimmed : undefined;
};

const resolveManagementToken = (): string | undefined =>
  asNonEmptyString(process.env.STORYBLOK_MANAGEMENT_TOKEN) ??
  asNonEmptyString(process.env.STORYBLOK_PAT);

const resolveManagementBaseUrl = (): string => {
  const configured = asNonEmptyString(process.env.STORYBLOK_MANAGEMENT_API_BASE_URL);
  return (configured ?? STORYBLOK_DEFAULT_MANAGEMENT_API_BASE_URL).replace(/\/+$/u, "");
};

// ─── Storyblok API fetchers ───────────────────────────────────────────────────

const fetchStyleGroups = async (
  spaceId: string,
  token: string,
  baseUrl: string,
): Promise<z.output<typeof aiStyleGroupSchema>[]> => {
  const response = await fetch(`${baseUrl}/spaces/${spaceId}/ai_style_groups`, {
    headers: { Authorization: token },
  });

  if (!response.ok) return [];

  const raw: unknown = await response.json();
  const parsed = aiStyleGroupsResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data.ai_style_groups : [];
};

const fetchOutputRules = async (
  spaceId: string,
  token: string,
  baseUrl: string,
): Promise<z.output<typeof aiOutputRuleSchema>[]> => {
  try {
    const response = await fetch(`${baseUrl}/spaces/${spaceId}/ai_output_rules`, {
      headers: { Authorization: token },
    });

    if (!response.ok) return [];

    const raw: unknown = await response.json();
    const parsed = aiOutputRulesResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data.ai_output_rules : [];
  } catch {
    // AI output rules endpoint may not be available; degrade gracefully
    return [];
  }
};

// ─── Content text extraction ──────────────────────────────────────────────────

const SKIP_KEYS = new Set(["component", "uid", "_uid", "id", "type", "marks", "attrs"]);
const MAX_EXTRACTION_DEPTH = 20;

const extractText = (value: unknown, depth = 0): string[] => {
  if (depth > MAX_EXTRACTION_DEPTH) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractText(item, depth + 1));
  }

  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // ProseMirror text node
    if (obj["type"] === "text" && typeof obj["text"] === "string") {
      const t = obj["text"].trim();
      return t.length > 0 ? [t] : [];
    }

    return Object.entries(obj)
      .filter(([key]) => !SKIP_KEYS.has(key))
      .flatMap(([, v]) => extractText(v, depth + 1));
  }

  return [];
};

// ─── Guidelines builder ───────────────────────────────────────────────────────

const buildGuidelines = (
  styleGroups: z.output<typeof aiStyleGroupSchema>[],
  outputRules: z.output<typeof aiOutputRuleSchema>[],
): string[] => {
  const rulesById = new Map(outputRules.map((r) => [r.id, r]));
  const guidelines: string[] = [];

  for (const group of styleGroups) {
    const groupRuleIds = group.ai_output_rule_ids;

    if (groupRuleIds.length > 0) {
      // Use the individual output rules (most specific)
      for (const ruleId of groupRuleIds) {
        const rule = rulesById.get(ruleId);
        if (rule) {
          const instruction = asNonEmptyString(rule.instructions) ?? rule.name;
          guidelines.push(`[${group.name} › ${rule.name}] ${instruction}`);
        }
      }
    } else if (asNonEmptyString(group.description)) {
      // Fall back to the style group description
      guidelines.push(`[${group.name}] ${group.description}`);
    } else {
      guidelines.push(`[${group.name}] Follow the "${group.name}" style group guidelines.`);
    }
  }

  return guidelines;
};

// ─── Exported step ────────────────────────────────────────────────────────────

export const runPreviewStyleGuideAudit = async (
  payload: StoryblokWorkflowWebhookPayload,
): Promise<AuditResult> => {
  "use step";

  const spaceId = asNonEmptyString(String(payload.space_id ?? ""));
  if (!spaceId) {
    return {
      audit: "preview-style-guide",
      message: "Missing space_id in webhook payload.",
      passed: false,
    };
  }

  const managementToken = resolveManagementToken();
  if (!managementToken) {
    return {
      audit: "preview-style-guide",
      message: "Missing Storyblok Management API token (STORYBLOK_MANAGEMENT_TOKEN or STORYBLOK_PAT).",
      passed: false,
    };
  }

  const openaiApiKey = asNonEmptyString(process.env.OPENAI_API_KEY);
  if (!openaiApiKey) {
    return {
      audit: "preview-style-guide",
      message: "Missing OPENAI_API_KEY environment variable.",
      passed: false,
    };
  }

  const baseUrl = resolveManagementBaseUrl();

  const [styleGroups, outputRules] = await Promise.all([
    fetchStyleGroups(spaceId, managementToken, baseUrl),
    fetchOutputRules(spaceId, managementToken, baseUrl),
  ]);

  if (styleGroups.length === 0) {
    return {
      audit: "preview-style-guide",
      message: "No AI style groups configured for this space. Skipping style guide audit.",
      meta: { skipped: true },
      passed: true,
    };
  }

  const textBlocks = extractText(payload.story?.content);
  if (textBlocks.length === 0) {
    return {
      audit: "preview-style-guide",
      message: "No text content found in story to audit against style guidelines.",
      meta: { skipped: true },
      passed: true,
    };
  }

  const guidelines = buildGuidelines(styleGroups, outputRules);
  const contentText = textBlocks.join("\n\n");

  const openai = createOpenAI({ apiKey: openaiApiKey });
  const model = asNonEmptyString(process.env.OPENAI_MODEL) ?? "gpt-4o-mini";

  const { object: result } = await generateObject({
    messages: [
      {
        content: `You are a content compliance auditor. Check whether the following content adheres to each listed style guideline.

## Style Guidelines
${guidelines.map((g, i) => `${i + 1}. ${g}`).join("\n")}

## Content to Check
${contentText}

Analyze the content carefully against every guideline and report any violations you find.`,
        role: "user",
      },
    ],
    model: openai(model),
    schema: complianceResultSchema,
  });

  return {
    audit: "preview-style-guide",
    message: result.passed
      ? "Content follows all configured style guidelines."
      : `Content has ${result.violations.length} style guideline violation(s).`,
    meta: {
      guidelines,
      model,
      styleGroupsChecked: styleGroups.map((g) => g.name),
      summary: result.summary,
      violations: result.violations,
    },
    passed: result.passed,
  };
};
