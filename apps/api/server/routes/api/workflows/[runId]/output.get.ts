import { HTTPError, defineEventHandler, getRouterParam } from "h3";
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
import { formatErrorMessage } from "../../../../utils/workflow-utils.ts";

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_NOT_FOUND = 404;

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



const resolveErrorMessage = (error: unknown): string =>
  formatErrorMessage(error);

const persistWorkflowRunDataSafely = async (response: WorkflowRunOutputResponse): Promise<void> => {
  try {
    await persistWorkflowRunOutput(response);
  } catch (error) {
    logger.warn(
      {
        error: resolveErrorMessage(error),
        runId: response.runId,
      },
      "[Workflows/Output] Failed to persist workflow run output snapshot",
    );
  }
};

const fetchPersistedWorkflowRunData = async (
  runId: string,
): Promise<WorkflowRunOutputResponse | undefined> => {
  const persistedOutput = await readPersistedWorkflowRunOutput(runId);
  if (persistedOutput) {
    logger.info({ runId }, "[Workflows/Output] Found persisted output from database");
    return persistedOutput;
  }

  const workflowRunId = resolveWorkflowRunId(runId);
  if (workflowRunId !== runId) {
    logger.info({ runId, workflowRunId }, "[Workflows/Output] Resolved public run ID to workflow run ID");
    const persistedRecord = await readPersistedWorkflowRunRecord(workflowRunId, runId);
    if (persistedRecord) {
      logger.info({ runId, workflowRunId }, "[Workflows/Output] Found persisted record from file");
      return persistedRecord;
    }
  } else {
    logger.info(
      { runId },
      "[Workflows/Output] Could not resolve workflow run ID — no mapping found in database",
    );
  }

  return undefined;
};

const tryFetchWorkflowRunData = async (runId: string): Promise<WorkflowRunOutputResponse | null> => {
  const workflowRunId = resolveWorkflowRunId(runId);

  if (workflowRunId === runId) {
    logger.info(
      { runId },
      "[Workflows/Output] No workflow run ID mapping found — skipping live engine fetch",
    );
    return null;
  }

  try {
    logger.info({ runId, workflowRunId }, "[Workflows/Output] Fetching from workflow engine");
    const run = getRun<unknown>(workflowRunId);
    const status: WorkflowRunStatus = await run.status;

    const [workflowName, createdAt, startedAt, completedAt] = await Promise.all([
      run.workflowName,
      run.createdAt,
      run.startedAt,
      run.completedAt,
    ]);

    const output = await (status === "completed" ? run.returnValue : undefined);

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
  } catch (error) {
    logger.warn(
      { runId, workflowRunId, error: resolveErrorMessage(error) },
      "[Workflows/Output] Failed to fetch from workflow engine",
    );
    return null;
  }
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

  // Try to fetch fresh data from the workflow engine
  logger.info({ runId }, "[Workflows/Output] Attempting to fetch from workflow engine");
  const freshResponse = await tryFetchWorkflowRunData(runId);

  if (freshResponse) {
    const normalizedResponse: WorkflowRunOutputResponse = {
      ...freshResponse,
      output: normalizeOutputSummary(freshResponse.output),
    };

    await persistWorkflowRunDataSafely(normalizedResponse);
    logger.info({ runId, status: freshResponse.status }, "[Workflows/Output] Returning fresh workflow output");
    return normalizedResponse;
  }

  // Fallback to persisted data
  logger.info({ runId }, "[Workflows/Output] Fresh data unavailable, trying persisted storage");
  const persistedResponse = await fetchPersistedWorkflowRunData(runId);
  if (persistedResponse) {
    logger.info({ runId, status: persistedResponse.status }, "[Workflows/Output] Returning persisted workflow output");
    return {
      ...persistedResponse,
      output: normalizeOutputSummary(persistedResponse.output),
    };
  }

  // Neither fresh nor persisted found
  logger.warn(
    { runId },
    "[Workflows/Output] Workflow run not found in engine or persistent storage",
  );
  throw new HTTPError({
    message: `Workflow run '${runId}' not found.`,
    status: HTTP_STATUS_NOT_FOUND,
  });
});
