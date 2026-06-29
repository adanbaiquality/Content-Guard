/**
 * High-level workflow store orchestration.
 * Coordinates between workflow-run-cache and workflow-run-output-store
 * to provide convenient combined operations.
 */

import logger from "./logger.ts";
import {
  getLatestRunId,
  rememberLatestRunId,
  resolvePublicRunId,
  resolveWorkflowRunId,
} from "./workflow-run-cache.ts";
import {
  persistWorkflowRunOutput,
  readPersistedWorkflowRunOutput,
  type WorkflowRunOutputResponse,
} from "./workflow-run-output-store.ts";

/**
 * Record a new workflow run as the latest for a story and persist its output.
 */
export async function rememberAndPersistWorkflowRun(params: {
  publicRunId: string;
  spaceId: string | number;
  storyId: string | number;
  workflowRunId?: string;
  output: WorkflowRunOutputResponse;
}): Promise<void> {
  const { publicRunId, spaceId, storyId, workflowRunId, output } = params;

  // Record as latest for this story
  rememberLatestRunId({ publicRunId, spaceId, storyId, workflowRunId });

  // Persist the output
  await persistWorkflowRunOutput(output);
}

/**
 * Retrieve a workflow run's output, resolving public/workflow ID mappings.
 * Returns undefined if not found.
 */
export async function retrieveWorkflowRunOutput(
  runId: string,
): Promise<WorkflowRunOutputResponse | undefined> {
  // First try direct lookup with the given ID
  let output = await readPersistedWorkflowRunOutput(runId);

  if (output) {
    return output;
  }

  // Try resolving as a workflow run ID to public ID
  const publicRunId = resolvePublicRunId(runId);
  if (publicRunId && publicRunId !== runId) {
    output = await readPersistedWorkflowRunOutput(publicRunId);
    if (output) {
      return output;
    }
  }

  // Try resolving as a public ID to workflow run ID
  const workflowRunId = resolveWorkflowRunId(runId);
  if (workflowRunId && workflowRunId !== runId) {
    output = await readPersistedWorkflowRunOutput(workflowRunId);
  }

  return output;
}

/**
 * Get the latest run for a story, with full context logging.
 */
export function getLatestWorkflowRunForStory(params: {
  spaceId: string | number;
  storyId: string | number;
}): string | undefined {
  const { spaceId, storyId } = params;
  const runId = getLatestRunId({ spaceId, storyId });

  if (!runId) {
    logger.info(
      { spaceId, storyId },
      "[WorkflowStore] No latest workflow run found for story",
    );
  }

  return runId;
}
