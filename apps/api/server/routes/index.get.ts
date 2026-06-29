import { defineEventHandler } from "h3";
import logger from "../utils/logger.ts";

export default defineEventHandler(() => {
  logger.info("[API] Root route accessed");
  return {
  routes: [
    { method: "GET", path: "/api/health" },
    { method: "GET", path: "/api/workflows" },
    { method: "GET", path: "/api/workflows/:runId/output" },
    { method: "POST", path: "/api/webhooks/storyblok/workflow-changed" },
    { method: "GET", path: "/api/workflows/latest?id=:storyId&spaceid=:spaceId" },
  ],
  ok: true,
  service: "@content-guard/api",
  };
});
