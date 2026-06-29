import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { defineEventHandler } from "h3";
import { parseWorkflowName } from "workflow/observability";

import { resolvePublicRunId } from "../../../utils/workflow-run-cache.ts";

type WorkflowRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

interface PersistedWorkflowRunRecord {
  completedAt?: string;
  createdAt: string;
  deploymentId?: string;
  runId: string;
  startedAt?: string;
  status: WorkflowRunStatus;
  updatedAt?: string;
  workflowName: string;
}

interface PersistedWorkflowRunOutputRecord {
  runId: string;
  status: WorkflowRunStatus;
  timestamps?: {
    completedAt?: string;
    createdAt?: string;
    startedAt?: string;
  };
  workflowName: string;
}

interface WorkflowRunListItem {
  completedAt?: string;
  createdAt: string;
  deploymentId?: string;
  displayName: string;
  runId: string;
  startedAt?: string;
  status: WorkflowRunStatus;
  updatedAt?: string;
  workflowName: string;
  workflowRunId: string;
}

const WORKFLOW_DATA_DIRECTORY = join(process.cwd(), ".workflow-data");
const RUNS_DIRECTORY = join(WORKFLOW_DATA_DIRECTORY, "runs");
const OUTPUTS_DIRECTORY = join(WORKFLOW_DATA_DIRECTORY, "outputs");

const sortByNewestFirst = (left: WorkflowRunListItem, right: WorkflowRunListItem): number =>
  Date.parse(right.createdAt) - Date.parse(left.createdAt);

const toWorkflowRunListItem = (record: PersistedWorkflowRunRecord): WorkflowRunListItem => {
  const parsedWorkflowName = parseWorkflowName(record.workflowName);

  return {
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    deploymentId: record.deploymentId,
    displayName: parsedWorkflowName?.shortName ?? record.workflowName,
    runId: resolvePublicRunId(record.runId) ?? record.runId,
    startedAt: record.startedAt,
    status: record.status,
    updatedAt: record.updatedAt,
    workflowName: record.workflowName,
    workflowRunId: record.runId,
  };
};

const toWorkflowRunListItemFromOutput = (
  record: PersistedWorkflowRunOutputRecord,
): WorkflowRunListItem | undefined => {
  const createdAt = record.timestamps?.createdAt;

  if (!record.runId || !record.workflowName || !createdAt || !record.status) {
    return undefined;
  }

  const parsedWorkflowName = parseWorkflowName(record.workflowName);

  return {
    completedAt: record.timestamps?.completedAt,
    createdAt,
    displayName: parsedWorkflowName?.shortName ?? record.workflowName,
    runId: record.runId,
    startedAt: record.timestamps?.startedAt,
    status: record.status,
    workflowName: record.workflowName,
    workflowRunId: record.runId,
  };
};

const readRunRecord = async (fileName: string): Promise<WorkflowRunListItem | undefined> => {
  if (!fileName.endsWith(".json")) {
    return undefined;
  }

  const filePath = join(RUNS_DIRECTORY, fileName);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as PersistedWorkflowRunRecord;

  if (!parsed.runId || !parsed.workflowName || !parsed.createdAt || !parsed.status) {
    return undefined;
  }

  return toWorkflowRunListItem(parsed);
};

const readOutputRecord = async (fileName: string): Promise<WorkflowRunListItem | undefined> => {
  if (!fileName.endsWith(".json")) {
    return undefined;
  }

  const filePath = join(OUTPUTS_DIRECTORY, fileName);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as PersistedWorkflowRunOutputRecord;

  return toWorkflowRunListItemFromOutput(parsed);
};

const readWorkflowRunsFromDirectory = async (
  directory: string,
  readEntry: (fileName: string) => Promise<WorkflowRunListItem | undefined>,
): Promise<WorkflowRunListItem[]> => {
  try {
    const files = await readdir(directory);

    return (await Promise.all(files.map((fileName) => readEntry(fileName)))).filter(
      (run): run is WorkflowRunListItem => run !== undefined,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
};

export default defineEventHandler(async () => {
  const [runDirectoryRecords, outputDirectoryRecords] = await Promise.all([
    readWorkflowRunsFromDirectory(RUNS_DIRECTORY, readRunRecord),
    readWorkflowRunsFromDirectory(OUTPUTS_DIRECTORY, readOutputRecord),
  ]);

  const runsByRunId = new Map<string, WorkflowRunListItem>();

  for (const run of outputDirectoryRecords) {
    runsByRunId.set(run.runId, run);
  }

  for (const run of runDirectoryRecords) {
    runsByRunId.set(run.runId, run);
  }

  const runs = Array.from(runsByRunId.values()).sort(sortByNewestFirst);

  return {
    ok: true,
    runs,
    total: runs.length,
  };
});