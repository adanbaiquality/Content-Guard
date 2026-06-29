import { HTTPError, defineEventHandler, getRouterParam } from "h3";
import { WorkflowRunNotFoundError } from "workflow/errors";
import { getRun } from "workflow/api";

type WorkflowRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

interface WorkflowRunTimestamps {
  completedAt: string | undefined;
  createdAt: string;
  startedAt: string | undefined;
}

export interface WorkflowRunOutputResponse<TOutput = unknown> {
  ok: true;
  output: TOutput | undefined;
  runId: string;
  status: WorkflowRunStatus;
  timestamps: WorkflowRunTimestamps;
  workflowName: string;
}

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

const fetchWorkflowRunData = async (runId: string): Promise<WorkflowRunOutputResponse> => {
  const run = getRun<unknown>(runId);
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

  if (!runId) {
    throw new HTTPError({
      message: "Missing workflow runId in route params.",
      status: HTTP_STATUS_BAD_REQUEST,
    });
  }

  try {
    return await fetchWorkflowRunData(runId);
  } catch (error) {
    if (WorkflowRunNotFoundError.is(error)) {
      throw new HTTPError({
        message: `Workflow run '${runId}' not found.`,
        status: HTTP_STATUS_NOT_FOUND,
      });
    }

    throw new HTTPError({
      message: resolveErrorMessage(error),
      status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
    });
  }
});
