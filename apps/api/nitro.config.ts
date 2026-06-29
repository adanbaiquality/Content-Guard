import { defineConfig } from "nitro/config";

export default defineConfig({
  modules: ["workflow/nitro"],
  runtimeConfig: {
    workflow: {
      runtime: "nodejs24.x",
      sourcemap: "inline",
    },
  },
  serverDir: "./server",
});
