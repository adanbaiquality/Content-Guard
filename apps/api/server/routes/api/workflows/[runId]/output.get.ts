import { HTTPError, defineEventHandler, getRouterParam } from "h3";
import { WorkflowRunNotFoundError } from "workflow/errors";
import { getRun } from "workflow/api";

import logger from "../../../../utils/logger.ts";
import { resolveWorkflowRunId } from "../../../../utils/workflow-run-cache.ts";
import {
  persistWorkflowRunOutput,
  readPersistedWorkflowRunOutput,
  readPersistedWorkflowRunRecord,
  type WorkflowRunOutputResponse,
  type WorkflowRunStatus,
} from "../../../../utils/workflow-run-output-store.ts";

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

type AuditSummaryItem = {
  audits?: unknown;
  failed?: unknown;
  name?: unknown;
  passed?: unknown;
  total?: unknown;
};

type OutputWithSummary = {
  summary?: {
    checks?: unknown;
    steps?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toSafeNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeChecksToSingleAudit = (checks: unknown): unknown => {
  if (!Array.isArray(checks)) {
    return checks;
  }

  return checks.flatMap((item) => {
    if (!isObjectRecord(item)) {
      return [item];
    }

    const check = item as AuditSummaryItem;
    const audits = Array.isArray(check.audits) ? check.audits : [];

    if (audits.length <= 1) {
      return [
        {
          ...item,
          audits,
          failed: audits.length === 1 ? (audits[0] as { passed?: unknown }).passed === false ? 1 : 0 : toSafeNumber(check.failed, 0),
          passed: audits.length === 1 ? (audits[0] as { passed?: unknown }).passed === true ? 1 : 0 : toSafeNumber(check.passed, 0),
          total: audits.length <= 1 ? audits.length : toSafeNumber(check.total, audits.length),
        },
      ];
    }

    return audits.map((audit) => {
      const isPassed = isObjectRecord(audit) && audit.passed === true;
      return {
        ...item,
        audits: [audit],
        failed: isPassed ? 0 : 1,
        passed: isPassed ? 1 : 0,
        total: 1,
      };
    });
  });
};

const normalizeOutputSummary = (output: unknown): unknown => {
  if (!isObjectRecord(output)) {
    return output;
  }

  const typedOutput = output as OutputWithSummary;
  if (!isObjectRecord(typedOutput.summary)) {
    return output;
  }

  const summary = typedOutput.summary;
  const checksSource = summary.checks ?? summary.steps;
  const checks = normalizeChecksToSingleAudit(checksSource);

  const { steps: _legacySteps, ...summaryWithoutSteps } = summary;

  return {
    ...typedOutput,
    summary: {
      ...summaryWithoutSteps,
      checks,
    },
  };
};

const resolveWorkflowOutput = async (
  status: WorkflowRunStatus,
  run: ReturnType<typeof getRun>,
): Promise<unknown> => {
  if (status !== "completed") {
    return undefined;
  }

  return await run.returnValue;
};

const resolveErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to load workflow run output.";
};

const persistWorkflowRunDataSafely = async (response: WorkflowRunOutputResponse): Promise<void> => {
  try {
    await persistWorkflowRunOutput(response);
  } catch (error) {
    logger.warn(
      {
        error: resolveErrorMessage(error),
        runId: response.runId,
      },
      "Failed to persist workflow run output snapshot",
    );
  }
};

const fetchPersistedWorkflowRunData = async (
  runId: string,
): Promise<WorkflowRunOutputResponse | undefined> => {
  const persistedOutput = await readPersistedWorkflowRunOutput(runId);
  if (persistedOutput) {
    return persistedOutput;
  }

  const workflowRunId = resolveWorkflowRunId(runId);
  return await readPersistedWorkflowRunRecord(workflowRunId, runId);
};

const fetchWorkflowRunData = async (runId: string): Promise<WorkflowRunOutputResponse> => {
  const workflowRunId = resolveWorkflowRunId(runId);
  const run = getRun<unknown>(workflowRunId);
  const status: WorkflowRunStatus = await run.status;

  const [workflowName, createdAt, startedAt, completedAt] = await Promise.all([
    run.workflowName,
    run.createdAt,
    run.startedAt,
    run.completedAt,
  ]);

  const output = await resolveWorkflowOutput(status, run);

  const response: WorkflowRunOutputResponse = {
    ok: true,
    output,
    runId,
    status,
    timestamps: {
      completedAt: completedAt?.toISOString() ?? undefined,
      createdAt: createdAt.toISOString(),
      startedAt: startedAt?.toISOString() ?? undefined,
    },
    workflowName,
  };

  return response;
};

export default defineEventHandler(async (event) => {
  const runId = getRouterParam(event, "runId")?.trim();
  logger.info({ runId }, "[Workflows/Output] Request received");

  if (!runId) {
    logger.info("[Workflows/Output] Missing runId parameter");
    throw new HTTPError({
      message: "Missing workflow runId in route params.",
      status: HTTP_STATUS_BAD_REQUEST,
    });
  }

  try {
    logger.info({ runId }, "[Workflows/Output] Fetching workflow run data");
    const response = await fetchWorkflowRunData(runId);
    const normalizedResponse: WorkflowRunOutputResponse = {
      ...response,
      output: normalizeOutputSummary(response.output),
    };

    await persistWorkflowRunDataSafely(normalizedResponse);
    logger.info({ runId, status: response.status }, "[Workflows/Output] Successfully returning workflow output");
    return normalizedResponse;
  } catch (error) {
    logger.info({ runId, error: resolveErrorMessage(error) }, "[Workflows/Output] Error fetching fresh data, trying persisted");
    const persistedResponse = await fetchPersistedWorkflowRunData(runId);
    if (persistedResponse) {
      logger.info({ runId, status: persistedResponse.status }, "[Workflows/Output] Returning persisted workflow output");
      return {
        ...persistedResponse,
        output: normalizeOutputSummary(persistedResponse.output),
      };
    }

    if (WorkflowRunNotFoundError.is(error)) {
      logger.info({ runId }, "[Workflows/Output] Workflow run not found");
      throw new HTTPError({
        message: `Workflow run '${runId}' not found.`,
        status: HTTP_STATUS_NOT_FOUND,
      });
    }

    logger.info({ runId, error: resolveErrorMessage(error) }, "[Workflows/Output] Error loading workflow");
    throw new HTTPError({
      message: resolveErrorMessage(error),
      status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
    });
  }
});
