import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/support/buildServer.ts"],
    // Integration tests clone real git repositories and run latexmk, so they are slower
    // than the default allows, and they must not share a temporary workspace.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/transport/**"],
      // Read the numbers with care. tests/integration/* drive the server the way a real
      // client does, by spawning `node dist/index.js`, and v8 does not instrument a child
      // process. src/tools and src/server therefore report 0% while being exercised end to
      // end by those tests. Everything reachable in-process is covered directly.
    },
  },
});
