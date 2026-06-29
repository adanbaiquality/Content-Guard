import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { desc, eq } from "drizzle-orm";

import { getContentGuardOrm, workflowRunOutputsTable } from "./content-guard-orm.ts";
import logger from "./logger.ts";
import { formatErrorMessage, normalizeSafeRunId } from "./workflow-utils.ts";

export type WorkflowRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface WorkflowRunTimestamps {
  completedAt: string | undefined;
  createdAt: string;
  startedAt: string | undefined;
}

export interface WorkflowRunOutputResponse<TOutput = unknown> {
  errorMessage?: string;
  ok: true;
  output: TOutput | undefined;
  runId: string;
  status: WorkflowRunStatus;
  timestamps: WorkflowRunTimestamps;
  workflowName: string;
}

interface PersistedWorkflowRunRecord {
  completedAt?: string;
  createdAt: string;
  error?: {
    message?: string;
  };
  runId: string;
  startedAt?: string;
  status: WorkflowRunStatus;
  workflowName: string;
}

const WORKFLOW_DATA_DIRECTORY = join(process.cwd(), ".workflow-data");
const RUNS_DIRECTORY = join(WORKFLOW_DATA_DIRECTORY, "runs");
const OUTPUTS_DIRECTORY = join(WORKFLOW_DATA_DIRECTORY, "outputs");

const isWorkflowRunStatus = (value: unknown): value is WorkflowRunStatus =>
  value === "pending" ||
  value === "running" ||
  value === "completed" ||
  value === "failed" ||
  value === "cancelled";

const resolveJsonFilePath = (directory: string, runId: string): string | undefined => {
  const safeRunId = normalizeSafeRunId(runId);

  if (!safeRunId) {
    return undefined;
  }

  return join(directory, `${safeRunId}.json`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseWorkflowRunOutputResponse = (
  parsed: unknown,
): WorkflowRunOutputResponse | undefined => {
  if (!isRecord(parsed)) {
    return undefined;
  }

  const { output } = parsed;
  const createdAt = typeof parsed.timestamps === "object" && parsed.timestamps !== null
    ? (parsed.timestamps as Record<string, unknown>).createdAt
    : undefined;
  const startedAt = typeof parsed.timestamps === "object" && parsed.timestamps !== null
    ? (parsed.timestamps as Record<string, unknown>).startedAt
    : undefined;
  const completedAt = typeof parsed.timestamps === "object" && parsed.timestamps !== null
    ? (parsed.timestamps as Record<string, unknown>).completedAt
    : undefined;

  if (
    parsed.ok !== true ||
    typeof parsed.runId !== "string" ||
    !isWorkflowRunStatus(parsed.status) ||
    typeof parsed.workflowName !== "string" ||
    typeof createdAt !== "string"
  ) {
    return undefined;
  }

  return {
    errorMessage: typeof parsed.errorMessage === "string" ? parsed.errorMessage : undefined,
    ok: true,
    output,
    runId: parsed.runId,
    status: parsed.status,
    timestamps: {
      completedAt: typeof completedAt === "string" ? completedAt : undefined,
      createdAt,
      startedAt: typeof startedAt === "string" ? startedAt : undefined,
    },
    workflowName: parsed.workflowName,
  };
};

export async function persistWorkflowRunOutput(
  response: WorkflowRunOutputResponse,
): Promise<void> {
  const safeRunId = normalizeSafeRunId(response.runId);

  if (!safeRunId) {
    throw new Error("Invalid workflow runId for persistence.");
  }

  const db = getContentGuardOrm();
  const outputJson = response.output === undefined ? null : JSON.stringify(response.output);
  const updatedAt = new Date().toISOString();

  db.insert(workflowRunOutputsTable)
    .values({
      completedAt: response.timestamps.completedAt,
      createdAt: response.timestamps.createdAt,
      errorMessage: response.errorMessage,
      outputJson,
      runId: safeRunId,
      startedAt: response.timestamps.startedAt,
      status: response.status,
      updatedAt,
      workflowName: response.workflowName,
    })
    .onConflictDoUpdate({
      set: {
        completedAt: response.timestamps.completedAt,
        createdAt: response.timestamps.createdAt,
        errorMessage: response.errorMessage,
        outputJson,
        startedAt: response.timestamps.startedAt,
        status: response.status,
        updatedAt,
        workflowName: response.workflowName,
      },
      target: workflowRunOutputsTable.runId,
    })
    .run();
}

export async function readPersistedWorkflowRunOutput(
  runId: string,
): Promise<WorkflowRunOutputResponse | undefined> {
  const safeRunId = normalizeSafeRunId(runId);

  if (!safeRunId) {
    return undefined;
  }

  const db = getContentGuardOrm();
  const row = db.select({
    completedAt: workflowRunOutputsTable.completedAt,
    createdAt: workflowRunOutputsTable.createdAt,
    errorMessage: workflowRunOutputsTable.errorMessage,
    outputJson: workflowRunOutputsTable.outputJson,
    runId: workflowRunOutputsTable.runId,
    startedAt: workflowRunOutputsTable.startedAt,
    status: workflowRunOutputsTable.status,
    workflowName: workflowRunOutputsTable.workflowName,
  })
    .from(workflowRunOutputsTable)
    .where(eq(workflowRunOutputsTable.runId, safeRunId))
    .limit(1)
    .get();

  if (row) {
    if (
      typeof row.runId === "string" &&
      isWorkflowRunStatus(row.status) &&
      typeof row.workflowName === "string" &&
      typeof row.createdAt === "string"
    ) {
      let output: unknown;

      if (typeof row.outputJson === "string") {
        try {
          output = JSON.parse(row.outputJson);
        } catch (error) {
          logger.warn(
            { error: formatErrorMessage(error), runId },
            "[WorkflowRunOutputStore] Failed to parse output JSON",
          );
          output = undefined;
        }
      }

      return {
        errorMessage: typeof row.errorMessage === "string" ? row.errorMessage : undefined,
        ok: true,
        output,
        runId: row.runId,
        status: row.status,
        timestamps: {
          completedAt: typeof row.completedAt === "string" ? row.completedAt : undefined,
          createdAt: row.createdAt,
          startedAt: typeof row.startedAt === "string" ? row.startedAt : undefined,
        },
        workflowName: row.workflowName,
      };
    }

    return undefined;
  }

  // Backward compatibility for legacy JSON snapshots.
  const filePath = resolveJsonFilePath(OUTPUTS_DIRECTORY, runId);

  if (!filePath) {
    return undefined;
  }

  try {
    const raw = await readFile(filePath, "utf8");
    return parseWorkflowRunOutputResponse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    logger.warn(
      { error: formatErrorMessage(error), runId },
      "[WorkflowRunOutputStore] Failed to read legacy workflow run output from file",
    );
    throw error;
  }
}

export async function listPersistedWorkflowRunOutputs(): Promise<WorkflowRunOutputResponse[]> {
  const db = getContentGuardOrm();
  const rows = db.select({
    completedAt: workflowRunOutputsTable.completedAt,
    createdAt: workflowRunOutputsTable.createdAt,
    errorMessage: workflowRunOutputsTable.errorMessage,
    outputJson: workflowRunOutputsTable.outputJson,
    runId: workflowRunOutputsTable.runId,
    startedAt: workflowRunOutputsTable.startedAt,
    status: workflowRunOutputsTable.status,
    workflowName: workflowRunOutputsTable.workflowName,
  })
    .from(workflowRunOutputsTable)
    .orderBy(desc(workflowRunOutputsTable.createdAt))
    .all();

  const results: WorkflowRunOutputResponse[] = [];

  for (const row of rows) {
    if (
      typeof row.runId !== "string" ||
      !isWorkflowRunStatus(row.status) ||
      typeof row.workflowName !== "string" ||
      typeof row.createdAt !== "string"
    ) {
      continue;
    }

    let output: unknown;
    if (typeof row.outputJson === "string") {
      try {
        output = JSON.parse(row.outputJson);
      } catch (error) {
        logger.warn(
          { error: formatErrorMessage(error), runId: row.runId },
          "[WorkflowRunOutputStore] Failed to parse output JSON in list",
        );
        output = undefined;
      }
    }

    results.push({
      errorMessage: typeof row.errorMessage === "string" ? row.errorMessage : undefined,
      ok: true,
      output,
      runId: row.runId,
      status: row.status,
      timestamps: {
        completedAt: typeof row.completedAt === "string" ? row.completedAt : undefined,
        createdAt: row.createdAt,
        startedAt: typeof row.startedAt === "string" ? row.startedAt : undefined,
      },
      workflowName: row.workflowName,
    });
  }

  return results;
}

export async function readPersistedWorkflowRunRecord(
  workflowRunId: string,
  publicRunId = workflowRunId,
): Promise<WorkflowRunOutputResponse | undefined> {
  const filePath = resolveJsonFilePath(RUNS_DIRECTORY, workflowRunId);

  if (!filePath) {
    return undefined;
  }

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as PersistedWorkflowRunRecord;

    if (
      typeof parsed.runId !== "string" ||
      typeof parsed.workflowName !== "string" ||
      typeof parsed.createdAt !== "string" ||
      !isWorkflowRunStatus(parsed.status)
    ) {
      return undefined;
    }

    return {
      errorMessage: parsed.error?.message,
      ok: true,
      output: undefined,
      runId: publicRunId,
      status: parsed.status,
      timestamps: {
        completedAt: parsed.completedAt,
        createdAt: parsed.createdAt,
        startedAt: parsed.startedAt,
      },
      workflowName: parsed.workflowName,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    logger.warn(
      { error: formatErrorMessage(error), workflowRunId },
      "[WorkflowRunOutputStore] Failed to read workflow run record from file",
    );
    throw error;
  }
}