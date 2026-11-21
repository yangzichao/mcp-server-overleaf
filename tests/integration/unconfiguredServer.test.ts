import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { unfilledBundlePlaceholder } from "../support/bundlePlaceholder.js";
import { McpStdioClient } from "./mcpStdioClient.js";

const MISSING_TOKEN = "OVERLEAF_GIT_TOKEN is not set";

let isolatedHome: string;
let client: McpStdioClient | undefined;

beforeEach(() => {
  isolatedHome = mkdtempSync(join(tmpdir(), "overleaf-unconfigured-"));
});

afterEach(async () => {
  await client?.stop();
  client = undefined;
  rmSync(isolatedHome, { recursive: true, force: true });
});

/**
 * Glama's sandbox starts a listed server with no credentials. Before 0.3.7 this server exited
 * there before answering `initialize`, so the inspector never saw a single tool.
 */
it("starts with no credentials, lists every tool, and names the missing token when called", async () => {
  const emptyEnvironmentFile = join(isolatedHome, "empty.env");
  writeFileSync(emptyEnvironmentFile, "");
  client = await McpStdioClient.start({
    HOME: isolatedHome,
    XDG_CONFIG_HOME: join(isolatedHome, ".config"),
    // Without this the server falls back to the checkout's own .env, which may hold a real token.
    OVERLEAF_MCP_ENV_FILE: emptyEnvironmentFile,
    OVERLEAF_MCP_WORKSPACE_DIR: join(isolatedHome, "projects"),
  });

  expect(await client.listToolNames()).toHaveLength(23);
  expect(client.stderr).toContain(MISSING_TOKEN);
  expect(await client.call("list_projects")).toContain(MISSING_TOKEN);

  for (const project of [undefined, "https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1"]) {
    const response = await client.callRaw("read_file", { path: "main.tex", ...(project ? { project } : {}) });
    expect(response.result?.isError).toBe(true);
    expect(response.result?.content?.[0]?.text).toContain(MISSING_TOKEN);
  }
});

/**
 * Claude Desktop with only the required project address filled in. The specification does not say
 * whether an empty optional setting arrives as "" or as its placeholder, so both are tried.
 */
it.each([
  { unfilledToken: "", unfilledCookie: "" },
  {
    unfilledToken: unfilledBundlePlaceholder("overleaf_git_token"),
    unfilledCookie: unfilledBundlePlaceholder("overleaf_session_cookie"),
  },
])(
  "starts from the desktop bundle with a project and no credential (token $unfilledToken)",
  async ({ unfilledToken, unfilledCookie }) => {
    const emptyEnvironmentFile = join(isolatedHome, "empty.env");
    writeFileSync(emptyEnvironmentFile, "");
    client = await McpStdioClient.start({
      HOME: isolatedHome,
      XDG_CONFIG_HOME: join(isolatedHome, ".config"),
      OVERLEAF_MCP_ENV_FILE: emptyEnvironmentFile,
      OVERLEAF_MCP_WORKSPACE_DIR: join(isolatedHome, "projects"),
      OVERLEAF_PROJECT_ID: "https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1",
      OVERLEAF_GIT_TOKEN: unfilledToken,
      OVERLEAF_SESSION_COOKIE: unfilledCookie,
    });
    expect(await client.listToolNames()).toHaveLength(23);
    expect(await client.call("read_file", { path: "main.tex" })).toContain(MISSING_TOKEN);
  },
);
