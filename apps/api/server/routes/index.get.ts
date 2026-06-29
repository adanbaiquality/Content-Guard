import { defineEventHandler } from "h3";

export default defineEventHandler(() => ({
  endpoints: [
    { method: "GET", path: "/api/health" },
    { method: "POST", path: "/api/webhooks/storyblok/workflow-changed" },
  ],
  ok: true,
  service: "@content-guard/api",
}));
