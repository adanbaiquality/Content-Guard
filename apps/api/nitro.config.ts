import { defineConfig } from "nitro/config";

process.env.WORKFLOW_LOCAL_DATA_DIR ??= "node_modules/.nitro/workflow-data";
process.env.WORKFLOW_TARGET_WORLD ??= "local";

const isWindowsDev = process.platform === "win32" && process.env.NODE_ENV !== "production";
const shouldEnableWorkflowNitroModule =
  !isWindowsDev || process.env.CONTENT_GUARD_FORCE_WORKFLOW_ENGINE === "1";

export default defineConfig({
  modules: shouldEnableWorkflowNitroModule ? ["workflow/nitro"] : [],
  watchOptions: {
    ignored: [
      "**/.workflow-data/**",
      "**/node_modules/.nitro/workflow/**",
      "**/node_modules/.nitro/workflow-data/**",
    ],
  },
  runtimeConfig: {
    workflow: {
      runtime: "nodejs22.x",
      sourcemap: "inline",
    },
  },
  serverDir: "./server",
});
