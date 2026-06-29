import {
  type AuditResult,
  type StoryblokWorkflowWebhookPayload,
  runReviewingAudits,
} from "../server/audits/index.ts";
import { runFetchStoryAudit } from "./fetch-story.step.ts";
import { runPreviewA11yAxeAudit } from "./preview-a11y-axe.step.ts";
import { runPreviewAFMAudit } from "./preview-afm.step.ts";
import { runResolvePreviewUrlStep } from "./resolve-preview-url.step.ts";

export interface StoryblokReviewingAuditWorkflowResult {
  status: "completed";
  audits: AuditResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

export const runStoryblokReviewingAudits = async (
  payload: StoryblokWorkflowWebhookPayload,
): Promise<StoryblokReviewingAuditWorkflowResult> => {
  "use workflow";

  const enrichedPayload = await runResolvePreviewUrlStep(payload);
  const baseAudits = await runReviewingAudits(enrichedPayload);
  const fetchStoryAudit = await runFetchStoryAudit(enrichedPayload);
  const previewA11yAudit = await runPreviewA11yAxeAudit(enrichedPayload);
  const previewAFMAudit = await runPreviewAFMAudit(enrichedPayload);
  const audits = [...baseAudits, fetchStoryAudit, previewA11yAudit, previewAFMAudit];
  const passed = audits.filter((audit) => audit.passed).length;

  return {
    audits,
    status: "completed",
    summary: {
      failed: audits.length - passed,
      passed,
      total: audits.length,
    },
  };
};
