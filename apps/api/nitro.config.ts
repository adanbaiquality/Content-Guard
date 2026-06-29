import { defineConfig } from "nitro/config";

export default defineConfig({
  serverDir: "./server",
  modules: ["workflow/nitro"],
  runtimeConfig: {
    workflow: {
      runtime: "nodejs24.x",
      sourcemap: "inline",
    },
  },
});
