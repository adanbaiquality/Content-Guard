import { defineEventHandler } from "h3";

export default defineEventHandler(() => {
  return {
    ok: true,
    service: "@content-guard/api",
    endpoints: [
      { method: "GET", path: "/api/health" },
      { method: "POST", path: "/api/webhooks/storyblok/workflow-changed" },
    ],
  };
});
