import {
  type AuditResult,
  type StoryblokReviewingInput,
  runReviewingAudits,
} from "../server/audits/index.ts";
import { runFetchStoryStep } from "./fetch-story.step.ts";
import { runResolvePreviewUrlStep } from "./resolve-preview-url.step.ts";

const A11Y_HIGH_IMPACTS = new Set(["critical", "serious", "high"]);

const hasA11yHighErrors = (audit: AuditResult): boolean => {
  const violations = (audit.meta as { violations?: unknown } | undefined)?.violations;
  if (!Array.isArray(violations)) {
    return !audit.passed;
  }

  return violations.some((violation) => {
    if (typeof violation !== "object" || violation === null) {
      return false;
    }

    const impact = (violation as { impact?: unknown }).impact;
    return typeof impact === "string" && A11Y_HIGH_IMPACTS.has(impact.toLowerCase());
  });
};

const hasAfmHighErrors = (audit: AuditResult): boolean => {
  const violations = (audit.meta as { violations?: unknown } | undefined)?.violations;
  if (!Array.isArray(violations)) {
    return !audit.passed;
  }

  return violations.some((violation) => {
    if (typeof violation !== "object" || violation === null) {
      return false;
    }

    const severity = (violation as { severity?: unknown }).severity;
    return typeof severity === "string" && severity.toLowerCase() === "error";
  });
};

export interface StoryblokReviewingAuditWorkflowResult {
  status: "completed";
  audits: AuditResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    steps: Array<{
      name: string;
      total: number;
      passed: number;
      failed: number;
      audits: AuditResult[];
    }>;
  };
}

const executeStoryblokReviewingAudits = async (
  input: StoryblokReviewingInput,
): Promise<StoryblokReviewingAuditWorkflowResult> => {
  console.log("Running Storyblok reviewing audits workflow with input:", input);
  const payload = await runFetchStoryStep(input);
  const enrichedPayload = await runResolvePreviewUrlStep(payload);
  const baseAudits = await runReviewingAudits(enrichedPayload);

  // Tag base audits with their step name
  baseAudits.forEach((audit) => {
    audit.step = "audits";
  });

  const browserAudits: AuditResult[] = [];

  const [{ runPreviewA11yAxeAudit }, { runPreviewAFMAudit }, { runPreviewStyleGuideAudit }] =
    await Promise.all([
      import("./preview-a11y-axe.step.ts"),
      import("./preview-afm.step.ts"),
      import("./preview-style-guide.step.ts"),
    ]);

  const a11yAudit = await runPreviewA11yAxeAudit(enrichedPayload);
  a11yAudit.step = "preview-a11y-axe";
  browserAudits.push(a11yAudit);

  const afmAudit = await runPreviewAFMAudit(enrichedPayload);
  afmAudit.step = "preview-afm";
  browserAudits.push(afmAudit);

  const hasBlockingHighErrors = hasA11yHighErrors(a11yAudit) || hasAfmHighErrors(afmAudit);

  // oxlint-disable-next-line no-constant-condition
  const styleGuideAudit = hasBlockingHighErrors && false
    ? ({
        audit: "preview-style-guide",
        message:
          "Style guide audit was not run because A11y/AFM checks reported HIGH errors (page is not compliant).",
        meta: {
          error:
            "Blocked by prerequisite compliance checks: fix HIGH A11y/AFM errors before running style guide audit.",
          skipped: true,
          skippedReason: "blocked-by-high-compliance-errors",
        },
        passed: false,
      } satisfies AuditResult)
    : await runPreviewStyleGuideAudit(enrichedPayload);

  styleGuideAudit.step = "preview-style-guide";
  browserAudits.push(styleGuideAudit);

  const audits = [...baseAudits, ...browserAudits];
  const passed = audits.filter((audit) => audit.passed).length;

  // Group audits by step for detailed summary
  const stepMap = new Map<string, AuditResult[]>();
  audits.forEach((audit) => {
    const stepName = audit.step || "unknown";
    if (!stepMap.has(stepName)) {
      stepMap.set(stepName, []);
    }
    stepMap.get(stepName)!.push(audit);
  });

  const steps = Array.from(stepMap.entries()).map(([stepName, stepAudits]) => ({
    name: stepName,
    total: stepAudits.length,
    passed: stepAudits.filter((a) => a.passed).length,
    failed: stepAudits.filter((a) => !a.passed).length,
    audits: stepAudits,
  }));

  return {
    audits,
    status: "completed",
    summary: {
      failed: audits.length - passed,
      passed,
      total: audits.length,
      steps,
    },
  };
};

export const runStoryblokReviewingAudits = async (
  input: StoryblokReviewingInput,
): Promise<StoryblokReviewingAuditWorkflowResult> => {
  "use workflow";

  return executeStoryblokReviewingAudits(input);
};

export const runStoryblokReviewingAuditsInline = async (
  input: StoryblokReviewingInput,
): Promise<StoryblokReviewingAuditWorkflowResult> => executeStoryblokReviewingAudits(input);
