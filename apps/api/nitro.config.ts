import { defineConfig } from "nitro/config";

process.env.WORKFLOW_LOCAL_DATA_DIR ??= ".workflow-data";
process.env.WORKFLOW_TARGET_WORLD ??= "local";

// Locally an AV might block incoming requests to the workflow engine,
// The workflow/nitro module's LocalBuilder has a dual-watcher issue that causes
// infinite rebuilds even with watchOptions configured.
// Default behavior: disabled in development, enabled in production.
// Explicit override: CONTENT_GUARD_ENABLE_WORKFLOW_ENGINE=1|0.
const explicitWorkflowEngineSetting = process.env.CONTENT_GUARD_ENABLE_WORKFLOW_ENGINE;
const shouldEnableWorkflowNitroModule =
  explicitWorkflowEngineSetting === "1"
    ? true
    : explicitWorkflowEngineSetting === "0"
      ? false
      : process.env.NODE_ENV === "production";

export default defineConfig({
  debug: process.env.NODE_ENV === "development",
  modules: shouldEnableWorkflowNitroModule ? ["workflow/nitro"] : [],
  runtimeConfig: {
    workflow: {
      runtime: "nodejs24.x",
      sourcemap: false,
    },
  },
  watchOptions: {
    ignored: [
      "**/.swc/**",
      "**/.workflow-data/**",
      "**/node_modules/**",
      "**/.output/**",
      "**/.nitro/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/build/**",
      "**/.next/**",
      "**/*.db",
      "**/*.sqlite",
      "**/events/**",
      "**/runs/**",
      "**/steps/**",
      "**/.locks/**",
    ],
  },
  serverDir: "./server",
});
