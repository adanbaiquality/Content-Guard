import { start } from "workflow/api";
import { HTTPError, defineEventHandler, readBody } from "h3";
import { runStoryblokReviewingAudits } from "../../../../../workflows/storyblok-reviewing-audits.ts";
import type { StoryblokWorkflowWebhookPayload } from "../../../../audits/index.ts";

function resolveWorkflowState(payload: StoryblokWorkflowWebhookPayload): string {
  const raw = payload.workflow?.state ?? payload.workflow_state ?? payload.state;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export default defineEventHandler(async (event) => {
  const payload = await readBody<StoryblokWorkflowWebhookPayload>(event).catch(() => null);

  if (!payload || typeof payload !== "object") {
    throw new HTTPError({ message: "Invalid webhook body.", status: 400 });
  }

  const workflowState = resolveWorkflowState(payload);

  if (workflowState !== "reviewing") {
    return {
      ok: true,
      processed: false,
      reason: "State is not reviewing.",
      state: workflowState || null,
    };
  }

  const run = await start(runStoryblokReviewingAudits, [payload]);
  const runReference =
    (run as { id?: string; runId?: string; token?: string }).id ??
    (run as { id?: string; runId?: string; token?: string }).runId ??
    (run as { id?: string; runId?: string; token?: string }).token ??
    null;

  return {
    ok: true,
    processed: true,
    runId: runReference,
    state: workflowState,
  };
});
