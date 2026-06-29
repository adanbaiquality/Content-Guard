import { getRun } from "workflow/api";
import { WorkflowRunNotFoundError } from "workflow/errors";
import { defineEventHandler, getRouterParam, HTTPError } from "h3";

type WorkflowRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

interface WorkflowRunTimestamps {
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WorkflowRunOutputResponse<TOutput = unknown> {
  ok: true;
  runId: string;
  status: WorkflowRunStatus;
  output: TOutput | null;
  workflowName: string;
  timestamps: WorkflowRunTimestamps;
}

export default defineEventHandler(async (event) => {
  const runId = getRouterParam(event, "runId")?.trim();

  if (!runId) {
    throw new HTTPError({ message: "Missing workflow runId in route params.", status: 400 });
  }

  try {
    const run = getRun<unknown>(runId);
    const status: WorkflowRunStatus = await run.status;

    const [workflowName, createdAt, startedAt, completedAt] = await Promise.all([
      run.workflowName,
      run.createdAt,
      run.startedAt,
      run.completedAt,
    ]);

    const output: WorkflowRunOutputResponse["output"] =
      status === "completed" ? await run.returnValue : null;

    const response: WorkflowRunOutputResponse = {
      ok: true,
      runId,
      status,
      output,
      workflowName,
      timestamps: {
        createdAt: createdAt.toISOString(),
        startedAt: startedAt?.toISOString() ?? null,
        completedAt: completedAt?.toISOString() ?? null,
      },
    };

    return response;
  } catch (error) {
    if (WorkflowRunNotFoundError.is(error)) {
      throw new HTTPError({
        message: `Workflow run '${runId}' not found.`,
        status: 404,
      });
    }

    throw new HTTPError({
      message: error instanceof Error ? error.message : "Failed to load workflow run output.",
      status: 500,
    });
  }
});