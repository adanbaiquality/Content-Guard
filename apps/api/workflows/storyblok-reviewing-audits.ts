import {
  type AuditResult,
  type StoryblokWorkflowWebhookPayload,
  runReviewingAudits,
} from "../server/audits/index.ts";
import { runPreviewA11yAxeAudit } from "./preview-a11y-axe.step.ts";
import { runPreviewAFMAudit } from "./preview-afm.step.ts";

export interface StoryblokReviewingAuditWorkflowResult {
  status: "completed";
  audits: AuditResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

export async function runStoryblokReviewingAudits(
  payload: StoryblokWorkflowWebhookPayload,
): Promise<StoryblokReviewingAuditWorkflowResult> {
  "use workflow";

  const baseAudits = await runReviewingAudits(payload);
  const previewA11yAudit = await runPreviewA11yAxeAudit(payload);
  const previewAFMAudit = await runPreviewAFMAudit(payload);
  const audits = [...baseAudits, previewA11yAudit, previewAFMAudit];
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
}
