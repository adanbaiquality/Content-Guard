import { HTTPError, defineEventHandler, readBody } from "h3";
import { start } from "workflow/api";

import type { StoryblokWorkflowWebhookPayload } from "../../../../audits/index.ts";
import logger from "../../../../utils/logger.ts";
import { runStoryblokReviewingAudits } from "../../../../../workflows/storyblok-reviewing-audits.ts";

const REVIEWING_STATE = "reviewing";
const MIN_STRING_LENGTH = 1;
const HTTP_STATUS_BAD_REQUEST = 400;
const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length >= MIN_STRING_LENGTH) {
    return trimmed;
  }
  return undefined;
};

const normalizeIdentifier = (value: unknown): string | number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalizedString = asNonEmptyString(value);
  return normalizedString;
};

const resolveWorkflowState = (payload: StoryblokWorkflowWebhookPayload): string => {
  const raw = payload.workflow?.state ?? payload.workflow_state ?? payload.state;
  if (typeof raw === "string") {
    return raw.trim().toLowerCase();
  }
  return "";
};

const normalizeWebhookPayload = (
  input: Record<string, unknown>,
): StoryblokWorkflowWebhookPayload => {
  let story: StoryblokWorkflowWebhookPayload["story"] | undefined;
  if (input.story && typeof input.story === "object") {
    story = input.story as StoryblokWorkflowWebhookPayload["story"];
  }

  let workflow: StoryblokWorkflowWebhookPayload["workflow"] | undefined;
  if (input.workflow && typeof input.workflow === "object") {
    workflow = input.workflow as StoryblokWorkflowWebhookPayload["workflow"];
  }

  const payload: StoryblokWorkflowWebhookPayload = {
    ...input,
    environment:
      asNonEmptyString(input.environment) ??
      asNonEmptyString(input.environment_name) ??
      asNonEmptyString(input.env),
    environment_name:
      asNonEmptyString(input.environment_name) ??
      asNonEmptyString(input.environment) ??
      asNonEmptyString(input.env),
    space_id:
      normalizeIdentifier(input.space_id) ??
      normalizeIdentifier(input.spaceId) ??
      normalizeIdentifier((input.space as { id?: unknown } | undefined)?.id),
    story,
    story_id:
      normalizeIdentifier(input.story_id) ??
      normalizeIdentifier(input.storyId) ??
      normalizeIdentifier(story?.id),
    url:
      asNonEmptyString(input.url) ??
      asNonEmptyString(story?.full_slug) ??
      asNonEmptyString(story?.slug),
    workflow,
    workflow_state: asNonEmptyString(input.workflow_state) ?? asNonEmptyString(workflow?.state),
  };

  return payload;
};

const createWorkflowPayload = (
  input: StoryblokWorkflowWebhookPayload,
): StoryblokWorkflowWebhookPayload => ({
  ...input,
  environment: input.environment ?? input.environment_name,
  environment_name: input.environment_name ?? input.environment,
  space_id: input.space_id,
  state: REVIEWING_STATE,
  story: {
    ...input.story,
    id: input.story?.id ?? input.story_id,
  },
  story_id: input.story_id ?? input.story?.id,
  url: input.url,
  workflow: {
    ...input.workflow,
    state: REVIEWING_STATE,
  },
  workflow_state: REVIEWING_STATE,
});

const resolveRunReference = (run: unknown): string | undefined => {
  const castRun = run as { id?: string; runId?: string; token?: string };
  return castRun.id ?? castRun.runId ?? castRun.token;
};

const validateWebhookBody = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    logger.debug({ body }, "Invalid webhook body structure");
    throw new HTTPError({ message: "Invalid webhook body.", status: HTTP_STATUS_BAD_REQUEST });
  }

  logger.debug({ body }, "Webhook body parsed successfully");
  return body as Record<string, unknown>;
};

const validateRequiredFields = (input: StoryblokWorkflowWebhookPayload): void => {
  if (input.story_id === undefined && input.story?.id === undefined) {
    logger.debug("Missing required field: storyId");
    throw new HTTPError({
      message: "Missing required field: storyId.",
      status: HTTP_STATUS_BAD_REQUEST,
    });
  }

  if (input.space_id === undefined || input.url === undefined || input.environment === undefined) {
    logger.debug(
      {
        hasEnvironment: input.environment !== undefined,
        hasSpaceId: input.space_id !== undefined,
        hasUrl: input.url !== undefined,
      },
      "Missing required fields for reviewing state",
    );
    throw new HTTPError({
      message: "Missing required fields for reviewing state: spaceId, url, and environment.",
      status: HTTP_STATUS_BAD_REQUEST,
    });
  }
};

const logPayloadNormalization = (input: StoryblokWorkflowWebhookPayload): void => {
  logger.debug(
    {
      environment: input.environment,
      spaceId: input.space_id,
      storyId: input.story_id,
      url: input.url,
    },
    "Webhook payload normalized",
  );
};

const logWorkflowStart = (payload: StoryblokWorkflowWebhookPayload): void => {
  logger.debug(
    {
      environment: payload.environment,
      spaceId: payload.space_id,
      state: payload.workflow_state,
      storyId: payload.story_id,
    },
    "Starting storyblok reviewing audits workflow",
  );
};

const logWorkflowSuccess = (
  runReference: string | undefined,
  payload: StoryblokWorkflowWebhookPayload,
): void => {
  logger.debug({ runId: runReference, storyId: payload.story_id }, "Workflow started successfully");
};

const processReviewingWorkflow = async (
  input: StoryblokWorkflowWebhookPayload,
): Promise<{
  ok: boolean;
  processed: boolean;
  runId?: string;
  spaceId?: string | number;
  state: string;
  storyId?: string | number;
}> => {
  validateRequiredFields(input);
  logger.debug("All required validations passed, creating workflow payload");

  const payload = createWorkflowPayload(input);
  logWorkflowStart(payload);

  const run = await start(runStoryblokReviewingAudits, [payload]);
  const runReference = resolveRunReference(run);
  logWorkflowSuccess(runReference, payload);

  return {
    ok: true,
    processed: true,
    runId: runReference,
    spaceId: payload.space_id,
    state: REVIEWING_STATE,
    storyId: payload.story_id,
  };
};

const handleNonReviewingState = (
  workflowState: string,
): { ok: boolean; processed: boolean; reason: string; state?: string } => {
  logger.debug(
    { expectedState: REVIEWING_STATE, workflowState },
    "Workflow state does not match reviewing state, skipping processing",
  );
  return {
    ok: true,
    processed: false,
    reason: "State is not reviewing.",
    state: workflowState || undefined,
  };
};

export default defineEventHandler(async (event) => {
  logger.debug("Incoming webhook request received");

  const body = await readBody<unknown>(event).catch(() => undefined);
  const validatedBody = validateWebhookBody(body);
  const input = normalizeWebhookPayload(validatedBody);
  logPayloadNormalization(input);

  const workflowState = resolveWorkflowState(input);
  logger.debug({ workflowState }, "Workflow state resolved");

  if (workflowState !== REVIEWING_STATE) {
    return handleNonReviewingState(workflowState);
  }

  return processReviewingWorkflow(input);
});
