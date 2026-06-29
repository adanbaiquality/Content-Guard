import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import StoryblokClient from "storyblok-js-client";
import { z } from "zod";

import type {
  AuditResult,
  StoryblokWorkflowWebhookPayload,
} from "../server/audits/index.ts";
import logger from "../server/utils/logger.ts";

const MIN_STRING_LENGTH = 1;
const STORYBLOK_DEFAULT_MANAGEMENT_API_BASE_URL = "https://mapi.storyblok.com/v1";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const OPENAI_API_VERSION_QUERY_PARAM = "api-version";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const aiBrandingRuleSchema = z.object({
  additional_guidelines: z.string().optional().nullable(),
  always_use: z.string().optional().nullable(),
  avoid_use: z.string().optional().nullable(),
  brand_product_service: z.string().optional().nullable(),
  commonly_use: z.string().optional().nullable(),
  formatting: z.string().optional().nullable(),
  industry_niche: z.string().optional().nullable(),
  never_use: z.string().optional().nullable(),
  target_audience: z.string().optional().nullable(),
  tone_guidelines: z.string().optional().nullable(),
  values_or_personality_traits: z.string().optional().nullable(),
  writing_style: z.string().optional().nullable(),
});


const defaultAiBrandingRulesResponseSchema = z.object({
  ai_branding_rule: aiBrandingRuleSchema,
});

const complianceResultSchema = z.object({
  passed: z.boolean().describe("True if the content follows all style guidelines"),
  summary: z.string().describe("Brief summary of the style guide compliance check"),
  violations: z.array(
    z.object({
      excerpt: z.string().nullable().describe("The specific text that violates the guideline, or null when no direct excerpt is available"),
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
  asNonEmptyString(process.env.STORYBLOK_MANAGEMENT_JWT_TOKEN) ??
  asNonEmptyString(process.env.STORYBLOK_MANAGEMENT_TOKEN) ??
  asNonEmptyString(process.env.STORYBLOK_PAT);

const resolveManagementBaseUrl = (): string => {
  const configured = asNonEmptyString(process.env.STORYBLOK_MANAGEMENT_API_BASE_URL);
  return (configured ?? STORYBLOK_DEFAULT_MANAGEMENT_API_BASE_URL).replace(/\/+$/u, "");
};

const resolveOpenAIBaseUrl = (): string => {
  const configured =
    asNonEmptyString(process.env.OPENAI_BASE_URL) ??
    asNonEmptyString(process.env.OPENAI_API_BASE_URL) ??
    asNonEmptyString(process.env.OPENAI_ENDPOINT);

  return (configured ?? OPENAI_DEFAULT_BASE_URL).replace(/\/+$/u, "");
};

const resolveOpenAIApiVersion = (): string | undefined =>
  asNonEmptyString(process.env.OPENAI_API_VERSION);

const resolveOpenAIApiKeyHeader = (): string =>
  (asNonEmptyString(process.env.OPENAI_API_KEY_HEADER) ?? "Authorization").trim();

const buildOpenAIFetchWithOptionalApiVersion = (
  apiVersion: string | undefined,
): typeof fetch | undefined => {
  if (!apiVersion) {
    return undefined;
  }

  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);

    if (!url.searchParams.has(OPENAI_API_VERSION_QUERY_PARAM)) {
      url.searchParams.set(OPENAI_API_VERSION_QUERY_PARAM, apiVersion);
    }

    return fetch(new Request(url, request));
  };
};

// ─── Storyblok API fetchers ───────────────────────────────────────────────────

const getManagementClient = (token: string, baseUrl: string): StoryblokClient =>
  new StoryblokClient({
    endpoint: baseUrl,
    oauthToken: token,
  });

const fetchAiBrandingRules = async (
  spaceId: string,
  token: string,
  baseUrl: string,
): Promise<z.output<typeof aiBrandingRuleSchema> | undefined> => {
  const client = getManagementClient(token, baseUrl);

  try {
    const response = await client.get(`spaces/${spaceId}/ai_branding_rules`);
    const raw: unknown = response.data;
    console.log(`Fetched AI branding rules from Storyblok Management API for space ${spaceId}:`, raw);
    const parsed = defaultAiBrandingRulesResponseSchema.safeParse(raw);
    if (parsed.success && parsed.data.ai_branding_rule) {
      return parsed.data.ai_branding_rule;
    }
  } catch(error){
    console.warn(`Failed to fetch AI branding rules from Storyblok Management API for space ${spaceId}.`, error);
    // Fallback below handles spaces that only expose defaults or if endpoint is unavailable.
  }

  return undefined;
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
  brandingRules: z.output<typeof aiBrandingRuleSchema> | undefined,
): string[] => {
  const guidelines: string[] = [];

  const pushGuideline = (label: string, value: unknown): void => {
    const text = asNonEmptyString(value);
    if (text) {
      guidelines.push(`[${label}] ${text}`);
    }
  };

  if (brandingRules) {
    pushGuideline("Industry niche", brandingRules.industry_niche);
    pushGuideline("Brand product/service", brandingRules.brand_product_service);
    pushGuideline("Target audience", brandingRules.target_audience);
    pushGuideline("Tone guidelines", brandingRules.tone_guidelines);
    pushGuideline("Writing style", brandingRules.writing_style);
    pushGuideline("Values/personality traits", brandingRules.values_or_personality_traits);
    pushGuideline("Formatting", brandingRules.formatting);
    pushGuideline("Always use", brandingRules.always_use);
    pushGuideline("Commonly use", brandingRules.commonly_use);
    pushGuideline("Avoid use", brandingRules.avoid_use);
    pushGuideline("Never use", brandingRules.never_use);
    pushGuideline("Additional guidelines", brandingRules.additional_guidelines);
  }

  if (guidelines.length === 0) {
    guidelines.push("Follow configured brand voice, compliance, and writing standards.");
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

  const brandingRules = await fetchAiBrandingRules(spaceId, managementToken, baseUrl);

  logger.debug(
    {
      audit: "preview-style-guide",
      spaceId,
      brandingRules,
      resolvedRuleCount: brandingRules ? 1 : 0,
    },
    "Resolved AI branding rules from Storyblok Management API.",
  );

  if (!brandingRules) {
    return {
      audit: "preview-style-guide",
      message: "No AI branding rules configured for this space. Skipping style guide audit.",
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

  const guidelines = buildGuidelines(brandingRules);
  const contentText = textBlocks.join("\n\n");

  const openaiBaseUrl = resolveOpenAIBaseUrl();
  const openaiApiVersion = resolveOpenAIApiVersion();
  const openaiApiKeyHeader = resolveOpenAIApiKeyHeader();

  const openAIHeaders: Record<string, string> = {};
  let providerApiKey: string | undefined = openaiApiKey;

  if (openaiApiKeyHeader.toLowerCase() !== "authorization") {
    providerApiKey = undefined;
    openAIHeaders[openaiApiKeyHeader] = openaiApiKey;
  }

  const openai = createOpenAI({
    apiKey: providerApiKey,
    baseURL: openaiBaseUrl,
    fetch: buildOpenAIFetchWithOptionalApiVersion(openaiApiVersion),
    headers: openAIHeaders,
  });
  const model = asNonEmptyString(process.env.OPENAI_MODEL) ?? "gpt-4o-mini";

  const { output: result } = await generateText({
    messages: [
      {
        content: `You are a content compliance auditor. Check whether the following content adheres to each listed style guideline.

## Style Guidelines
${guidelines.map((g, i) => `${i + 1}. ${g}`).join("\n")}

## Content to Check
${contentText}

Analyze the content carefully against every guideline and report any violations you find.
For each violation item, always include these fields: guideline, explanation, and excerpt. Use excerpt=null when no direct quote is available.`,
        role: "user",
      },
    ],
    model: openai(model),
    output: Output.object({ schema: complianceResultSchema }),
  });

  return {
    audit: "preview-style-guide",
    message: result.passed
      ? "Content follows all configured style guidelines."
      : `Content has ${result.violations.length} style guideline violation(s).`,
    meta: {
      guidelines,
      openaiApiKeyHeader,
      openaiApiVersion,
      openaiBaseUrl,
      model,
      brandingRulesChecked: brandingRules ? 1 : 0,
      summary: result.summary,
      violations: result.violations,
    },
    passed: result.passed,
  };
};
