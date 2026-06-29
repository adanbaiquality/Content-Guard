const latestPublicRunIdsByStory = new Map<string, string>();
const workflowRunIdsByPublicRunId = new Map<string, string>();
const publicRunIdsByWorkflowRunId = new Map<string, string>();

function toCacheKey(spaceId: string | number, storyId: string | number): string {
  return `${String(spaceId).trim()}:${String(storyId).trim()}`;
}

function normalizeRunId(runId: string): string {
  return runId.trim();
}

export function rememberLatestRunId(params: {
  publicRunId: string;
  spaceId: string | number;
  storyId: string | number;
  workflowRunId?: string;
}): void {
  const { publicRunId, spaceId, storyId, workflowRunId } = params;
  const normalizedPublicRunId = normalizeRunId(publicRunId);

  latestPublicRunIdsByStory.set(toCacheKey(spaceId, storyId), normalizedPublicRunId);

  if (workflowRunId) {
    const normalizedWorkflowRunId = normalizeRunId(workflowRunId);
    workflowRunIdsByPublicRunId.set(normalizedPublicRunId, normalizedWorkflowRunId);
    publicRunIdsByWorkflowRunId.set(normalizedWorkflowRunId, normalizedPublicRunId);
  }
}

export function getLatestRunId(params: {
  spaceId: string | number;
  storyId: string | number;
}): string | undefined {
  const { spaceId, storyId } = params;
  return latestPublicRunIdsByStory.get(toCacheKey(spaceId, storyId));
}

export function resolveWorkflowRunId(runId: string): string {
  const normalizedRunId = normalizeRunId(runId);
  return workflowRunIdsByPublicRunId.get(normalizedRunId) ?? normalizedRunId;
}

export function resolvePublicRunId(workflowRunId: string): string | undefined {
  return publicRunIdsByWorkflowRunId.get(normalizeRunId(workflowRunId));
}
