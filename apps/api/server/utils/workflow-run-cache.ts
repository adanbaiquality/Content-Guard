const latestRunIdsByStory = new Map<string, string>();

function toCacheKey(spaceId: string | number, storyId: string | number): string {
  return `${String(spaceId).trim()}:${String(storyId).trim()}`;
}

export function rememberLatestRunId(params: {
  runId: string;
  spaceId: string | number;
  storyId: string | number;
}): void {
  const { runId, spaceId, storyId } = params;
  latestRunIdsByStory.set(toCacheKey(spaceId, storyId), runId);
}

export function getLatestRunId(params: {
  spaceId: string | number;
  storyId: string | number;
}): string | undefined {
  const { spaceId, storyId } = params;
  return latestRunIdsByStory.get(toCacheKey(spaceId, storyId));
}
