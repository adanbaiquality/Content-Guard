import { HTTPError, defineEventHandler, readBody } from "h3";
import { z } from "zod";
import { start } from "workflow/api";

import logger from "../../../../utils/logger.ts";
import {
  runStoryblokReviewingAudits,
  runStoryblokReviewingAuditsInline,
} from "../../../../../workflows/storyblok-reviewing-audits.ts";
import { rememberLatestRunId } from "../../../../utils/workflow-run-cache.ts";

const HTTP_STATUS_BAD_REQUEST = 400;
const LOCAL_WORKFLOW_RUN_ID_PREFIX = "local-run";

const WebhookBodySchema = z
  .object({
    id: z
      .union([z.number().finite(), z.string().trim().min(1)])
      .transform((val) => (typeof val === "string" ? val.trim() : val)),
    spaceid: z
      .union([z.number().finite(), z.string().trim().min(1)])
      .transform((val) => (typeof val === "string" ? val.trim() : val)),
  })
  .strict();

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export default defineEventHandler(async (event) => {
  logger.debug("Incoming webhook request received");

  const body = await readBody<unknown>(event).catch(() => undefined);

  let validatedInput: z.infer<typeof WebhookBodySchema>;

  try {
    validatedInput = WebhookBodySchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new HTTPError({
        message: `Invalid webhook body: ${fieldErrors}`,
        status: HTTP_STATUS_BAD_REQUEST,
      });
    }
    throw new HTTPError({
      message: "Invalid webhook body.",
      status: HTTP_STATUS_BAD_REQUEST,
    });
  }

  const { id: storyId, spaceid: spaceId } = validatedInput;

  logger.debug({ spaceId, storyId }, "Starting storyblok reviewing audits workflow");

  const shouldRunInlineInDev =
    process.platform === "win32" &&
    process.env.NODE_ENV !== "production" &&
    process.env.CONTENT_GUARD_FORCE_WORKFLOW_ENGINE !== "1";

  if (shouldRunInlineInDev) {
    const runId = `${LOCAL_WORKFLOW_RUN_ID_PREFIX}-${Date.now()}`;

    void runStoryblokReviewingAuditsInline({ spaceId, storyId })
      .then((result) => {
        logger.debug({ runId, summary: result.summary }, "Inline workflow completed");
        return result;
      })
      .catch((error) => {
        logger.error(
          {
            error: toErrorMessage(error),
            runId,
          },
          "Inline workflow failed",
        );
      });

    logger.warn(
      { runId },
      "Running workflow inline on Windows dev to avoid workflow engine crash. Set CONTENT_GUARD_FORCE_WORKFLOW_ENGINE=1 to force engine mode.",
    );

    rememberLatestRunId({ runId, spaceId, storyId });

    return { ok: true, runId, spaceId, storyId };
  }

  const run = await start(runStoryblokReviewingAudits, [{ spaceId, storyId }]);
  const runId =
    (run as { id?: string; runId?: string }).id ?? (run as { id?: string; runId?: string }).runId;

  logger.debug({ runId, storyId }, "Workflow started successfully");

  if (runId) {
    rememberLatestRunId({ runId, spaceId, storyId });
  }

  return { ok: true, runId, spaceId, storyId };
});
