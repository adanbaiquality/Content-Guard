import { HTTPError, defineEventHandler, readBody } from "h3";
import { z } from "zod";
import { getRun, start } from "workflow/api";

import logger from "../../../../utils/logger.ts";
import { resolveStoryblokTimestamp } from "../../../../audits/index.ts";
import {
  type StoryblokReviewingAuditWorkflowResult,
  runStoryblokReviewingAudits,
  runStoryblokReviewingAuditsInline,
} from "../../../../../workflows/storyblok-reviewing-audits.ts";
import { rememberLatestRunId } from "../../../../utils/workflow-run-cache.ts";
import {
  persistWorkflowRunOutput,
  type WorkflowRunOutputResponse,
  type WorkflowRunStatus,
} from "../../../../utils/workflow-run-output-store.ts";

const HTTP_STATUS_BAD_REQUEST = 400;

const WebhookBodySchema = z
  .object({
    id: z
      .union([z.number().finite(), z.string().trim().min(1)])
      .transform((val) => (typeof val === "string" ? val.trim() : val)),
    spaceid: z
      .union([z.number().finite(), z.string().trim().min(1)])
      .transform((val) => (typeof val === "string" ? val.trim() : val)),
    timestamp: z
      .union([z.number().finite(), z.string().trim().min(1)])
      .transform((val) => (typeof val === "string" ? val.trim() : val))
      .optional(),
  })
  .strict();

const toPublicRunId = (storyId: string | number, timestamp: string): string =>
  `${String(storyId).trim()}-${timestamp}`;

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

const DEFAULT_WORKFLOW_NAME =
  runStoryblokReviewingAudits.name ||
  runStoryblokReviewingAuditsInline.name ||
  "workflow//./workflows/storyblok-reviewing-audits//runStoryblokReviewingAudits";

const isWindowsDev = process.platform === "win32" && process.env.NODE_ENV !== "production";
const shouldUseWorkflowEngine = !isWindowsDev || process.env.CONTENT_GUARD_FORCE_WORKFLOW_ENGINE === "1";

const toIsoString = (value: Date | undefined): string | undefined => value?.toISOString();

const persistWorkflowRunOutputSafely = async (
  response: WorkflowRunOutputResponse<StoryblokReviewingAuditWorkflowResult>,
): Promise<void> => {
  try {
    await persistWorkflowRunOutput(response);
  } catch (error) {
    logger.warn(
      {
        error: toErrorMessage(error),
        runId: response.runId,
      },
      "Failed to persist workflow run output",
    );
  }
};

const createWorkflowRunResponse = (params: {
  createdAt: string;
  errorMessage?: string;
  output?: StoryblokReviewingAuditWorkflowResult;
  runId: string;
  startedAt?: string;
  status: WorkflowRunStatus;
  workflowName?: string;
}): WorkflowRunOutputResponse<StoryblokReviewingAuditWorkflowResult> => ({
  errorMessage: params.errorMessage,
  ok: true,
  output: params.output,
  runId: params.runId,
  status: params.status,
  timestamps: {
    completedAt:
      params.status === "completed" || params.status === "failed" || params.status === "cancelled"
        ? new Date().toISOString()
        : undefined,
    createdAt: params.createdAt,
    startedAt: params.startedAt,
  },
  workflowName: params.workflowName ?? DEFAULT_WORKFLOW_NAME,
});

const trackWorkflowEngineRun = async (params: {
  runId: string;
  workflowRunId: string;
}): Promise<void> => {
  const run = getRun<StoryblokReviewingAuditWorkflowResult>(params.workflowRunId);

  const [workflowName, createdAt, startedAt, initialStatus] = await Promise.all([
    run.workflowName,
    run.createdAt,
    run.startedAt,
    run.status,
  ]);

  await persistWorkflowRunOutputSafely(
    createWorkflowRunResponse({
      createdAt: createdAt.toISOString(),
      runId: params.runId,
      startedAt: toIsoString(startedAt),
      status: initialStatus,
      workflowName,
    }),
  );

  try {
    const output = await run.returnValue;
    const completedAt = await run.completedAt;

    await persistWorkflowRunOutputSafely({
      ok: true,
      output,
      runId: params.runId,
      status: "completed",
      timestamps: {
        completedAt: toIsoString(completedAt),
        createdAt: createdAt.toISOString(),
        startedAt: toIsoString(startedAt),
      },
      workflowName,
    });
  } catch (error) {
    const [status, completedAt] = await Promise.all([
      run.status.catch(() => "failed" as const),
      run.completedAt.catch(() => undefined),
    ]);

    await persistWorkflowRunOutputSafely({
      errorMessage: toErrorMessage(error),
      ok: true,
      output: undefined,
      runId: params.runId,
      status: status === "cancelled" ? "cancelled" : "failed",
      timestamps: {
        completedAt: toIsoString(completedAt),
        createdAt: createdAt.toISOString(),
        startedAt: toIsoString(startedAt),
      },
      workflowName,
    });
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

  const { id: storyId, spaceid: spaceId, timestamp: rawTimestamp } = validatedInput;
  const timestamp = resolveStoryblokTimestamp(rawTimestamp);
  const publicRunId = toPublicRunId(
    storyId,
    timestamp ?? String(Math.floor(Date.now() / 1_000)),
  );

  logger.debug({ publicRunId, spaceId, storyId, timestamp }, "Starting storyblok reviewing audits workflow");

  const runId = publicRunId;

  if (shouldUseWorkflowEngine) {
    const run = await start(runStoryblokReviewingAudits, [{ spaceId, storyId, timestamp }]);
    const workflowRunId =
      (run as { id?: string; runId?: string }).id ?? (run as { id?: string; runId?: string }).runId;

    logger.debug({ runId, storyId, timestamp, workflowRunId }, "Workflow started successfully");

    rememberLatestRunId({ publicRunId: runId, spaceId, storyId, workflowRunId });

    if (workflowRunId) {
      void trackWorkflowEngineRun({ runId, workflowRunId }).catch((error) => {
        logger.error(
          {
            error: toErrorMessage(error),
            runId,
            workflowRunId,
          },
          "Failed to persist workflow engine run output",
        );
      });
    }

    return { ok: true, runId, spaceId, storyId, timestamp };
  }

  logger.debug(
    { runId, spaceId, storyId, timestamp },
    "Workflow engine disabled; running Storyblok reviewing audits inline",
  );

  const createdAt = new Date().toISOString();
  const startedAt = createdAt;

  try {
    const output = await runStoryblokReviewingAuditsInline({ spaceId, storyId, timestamp });

    await persistWorkflowRunOutputSafely(
      createWorkflowRunResponse({
        createdAt,
        output,
        runId,
        startedAt,
        status: "completed",
        workflowName: DEFAULT_WORKFLOW_NAME,
      }),
    );

    rememberLatestRunId({ publicRunId: runId, spaceId, storyId });

    return { ok: true, runId, spaceId, storyId, timestamp };
  } catch (error) {
    await persistWorkflowRunOutputSafely(
      createWorkflowRunResponse({
        createdAt,
        errorMessage: toErrorMessage(error),
        runId,
        startedAt,
        status: "failed",
        workflowName: DEFAULT_WORKFLOW_NAME,
      }),
    );

    throw error;
  }

});
