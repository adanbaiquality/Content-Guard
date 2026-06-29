import {
  runReviewingAudits,
  type AuditResult,
  type StoryblokWorkflowWebhookPayload,
} from "../server/audits/index.ts";
import { runPreviewA11yAxeAudit } from "./preview-a11y-axe.step.ts";

export type StoryblokReviewingAuditWorkflowResult = {
  status: "completed";
  audits: AuditResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
};

export async function runStoryblokReviewingAudits(
  payload: StoryblokWorkflowWebhookPayload,
): Promise<StoryblokReviewingAuditWorkflowResult> {
  "use workflow";

  const baseAudits = await runReviewingAudits(payload);
  const previewA11yAudit = await runPreviewA11yAxeAudit(payload);
  const audits = [...baseAudits, previewA11yAudit];
  const passed = audits.filter((audit) => audit.passed).length;

  return {
    status: "completed",
    audits,
    summary: {
      total: audits.length,
      passed,
      failed: audits.length - passed,
    },
  };
}
