import { defineConfig } from "vitest/config";
import { WITHOUT_BACKGROUND_GIT_MAINTENANCE } from "./tests/support/withoutBackgroundGitMaintenance.js";

export default defineConfig({
  test: {
    include: ["tests/endToEnd/**/*.test.ts"],
    globalSetup: ["./tests/support/buildServer.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    env: WITHOUT_BACKGROUND_GIT_MAINTENANCE,
  },
});
