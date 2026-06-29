import { HTTPError, defineEventHandler, getQuery, sendRedirect } from "h3";

import logger from "../../../utils/logger.ts";
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
  logger.info({ query }, "[Workflows/Latest] Request received");

  const storyId = query.id?.trim() || query.storyId?.trim();
  const spaceId = query.spaceid?.trim() || query.spaceId?.trim();

  if (!storyId || !spaceId) {
    logger.info({ storyId, spaceId }, "[Workflows/Latest] Missing required query params");
    throw new HTTPError({
      message: "Missing required query params: id and spaceid.",
      status: HTTP_STATUS_BAD_REQUEST,
    });
  }

  const runId = getLatestRunId({ spaceId, storyId });
  if (!runId) {
    logger.info({ storyId, spaceId }, "[Workflows/Latest] No cached workflow run found");
    throw new HTTPError({
      message: "No cached workflow run found for this story.",
      status: HTTP_STATUS_NOT_FOUND,
    });
  }

  const location = `/api/workflows/${runId}/output`;
  logger.info({ runId, location }, "[Workflows/Latest] Redirecting to output");

  return sendRedirect(event, location, 302);
});
