import {
  type AuditResult,
  type StoryblokReviewingInput,
  runReviewingAudits,
} from "../server/audits/index.ts";
import { runFetchStoryStep } from "./fetch-story.step.ts";
import { runResolvePreviewUrlStep } from "./resolve-preview-url.step.ts";

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

  const styleGuideAudit = await runPreviewStyleGuideAudit(enrichedPayload);
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
