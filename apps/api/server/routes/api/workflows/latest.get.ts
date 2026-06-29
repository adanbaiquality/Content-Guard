import { HTTPError, defineEventHandler, getQuery } from "h3";

import { getLatestRunId } from "../../../utils/workflow-run-cache.ts";

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_NOT_FOUND = 404;

type WorkflowLatestQuery = {
  id?: string;
  spaceid?: string;
  spaceId?: string;
  storyId?: string;
};

export default defineEventHandler((event) => {
  const query = getQuery(event) as WorkflowLatestQuery;

  const storyId = query.id?.trim() || query.storyId?.trim();
  const spaceId = query.spaceid?.trim() || query.spaceId?.trim();

  if (!storyId || !spaceId) {
    throw new HTTPError({
      message: "Missing required query params: id and spaceid.",
      status: HTTP_STATUS_BAD_REQUEST,
    });
  }

  const runId = getLatestRunId({ spaceId, storyId });
  if (!runId) {
    throw new HTTPError({
      message: "No cached workflow run found for this story.",
      status: HTTP_STATUS_NOT_FOUND,
    });
  }

  return {
    ok: true,
    runId,
    spaceId,
    storyId,
  };
});
