import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;

const isWorkflowRunStatus = (value: unknown): value is WorkflowRunStatus =>
  value === "pending" ||
  value === "running" ||
  value === "completed" ||
  value === "failed" ||
  value === "cancelled";

const normalizeSafeRunId = (runId: string): string | undefined => {
  const trimmedRunId = runId.trim();

  if (!trimmedRunId || !SAFE_RUN_ID_PATTERN.test(trimmedRunId)) {
    return undefined;
  }

  return trimmedRunId;
};

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
  const filePath = resolveJsonFilePath(OUTPUTS_DIRECTORY, response.runId);

  if (!filePath) {
    throw new Error("Invalid workflow runId for persistence.");
  }

  await mkdir(OUTPUTS_DIRECTORY, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(response, null, 2)}\n`, "utf8");
}

export async function readPersistedWorkflowRunOutput(
  runId: string,
): Promise<WorkflowRunOutputResponse | undefined> {
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

    throw error;
  }
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

    throw error;
  }
}