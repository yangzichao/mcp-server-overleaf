import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import * as shared from "../../scripts/plugins/renderSharedMcpServers.mjs";

const { mcpServerName, pluginName, renderPluginMcpServers } = shared;

const packageMetadata = { name: "mcp-server-overleaf", version: "9.9.9" };

describe("renderPluginMcpServers", () => {
  it("launches the exact npm version being released through npx on stdio", () => {
    const server = renderPluginMcpServers(packageMetadata).mcpServers[mcpServerName];
    expect(server.command).toBe("npx");
    expect(server.args).toEqual(["--yes", "mcp-server-overleaf@9.9.9", "--stdio"]);
  });

  it("declares no environment variables, so a published plugin holds no credential", () => {
    const server = renderPluginMcpServers(packageMetadata).mcpServers[mcpServerName];
    expect(Object.keys(server)).toEqual(["command", "args"]);
  });
});

describe("the committed MCP configuration", () => {
  const realMetadata = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  it("matches what the renderer produces", () => {
    const committed = JSON.parse(
      readFileSync(new URL(`../../plugins/${pluginName}/.mcp.json`, import.meta.url), "utf8"),
    );
    expect(committed).toEqual(renderPluginMcpServers(realMetadata));
  });

  it("carries no env block, which is why .gitignore un-ignores exactly this path", () => {
    const committed = JSON.parse(
      readFileSync(new URL(`../../plugins/${pluginName}/.mcp.json`, import.meta.url), "utf8"),
    );
    expect(Object.values(committed.mcpServers).every((server) => !("env" in (server as object)))).toBe(true);
  });
});
