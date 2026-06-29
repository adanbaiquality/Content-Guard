import { defineEventHandler } from "h3";
import logger from "../../utils/logger.ts";

export default defineEventHandler(() => {
  logger.info("[Health] Health check endpoint called");
  return {
  ok: true,
  service: "@content-guard/api",
  };
});
