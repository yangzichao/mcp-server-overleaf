import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import * as claudeCodePlugin from "../../scripts/plugins/renderClaudeCodePlugin.mjs";
// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { pluginName } from "../../scripts/plugins/renderSharedMcpServers.mjs";

const { claudeCodeMarketplaceName, renderClaudeCodeMarketplace, renderClaudeCodePluginManifest } =
  claudeCodePlugin;

const packageMetadata = {
  name: "mcp-server-overleaf",
  version: "9.9.9",
  description: "MCP server for Overleaf.",
  homepage: "https://github.com/yangzichao/mcp-server-overleaf#readme",
  author: "Zichao Yang",
  license: "MIT",
  keywords: ["mcp", "overleaf"],
};

function readCommittedJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8"));
}

describe("renderClaudeCodePluginManifest", () => {
  it("versions the plugin with the server it installs", () => {
    expect(renderClaudeCodePluginManifest(packageMetadata).version).toBe("9.9.9");
  });

  it("names no MCP file, because Claude Code reads .mcp.json from the plugin root", () => {
    expect(renderClaudeCodePluginManifest(packageMetadata)).not.toHaveProperty("mcpServers");
  });
});

describe("renderClaudeCodeMarketplace", () => {
  it("points at the plugin directory shared with Codex", () => {
    const [entry] = renderClaudeCodeMarketplace(packageMetadata).plugins;
    expect(entry.name).toBe(pluginName);
    expect(entry.source).toBe(`./plugins/${pluginName}`);
  });
});

describe("the committed Claude Code plugin", () => {
  const realMetadata = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  it("matches the manifest the renderer produces", () => {
    expect(readCommittedJson(`plugins/${pluginName}/.claude-plugin/plugin.json`)).toEqual(
      renderClaudeCodePluginManifest(realMetadata),
    );
  });

  it("matches the marketplace entry the renderer produces", () => {
    expect(readCommittedJson(".claude-plugin/marketplace.json")).toEqual(
      renderClaudeCodeMarketplace(realMetadata),
    );
  });

  it("is listed under the marketplace name the install command names", () => {
    expect(readCommittedJson(".claude-plugin/marketplace.json").name).toBe(claudeCodeMarketplaceName);
  });

  it("uses the same marketplace name as the Codex half, so one name covers both", () => {
    expect(readCommittedJson(".claude-plugin/marketplace.json").name).toBe(
      readCommittedJson(".agents/plugins/marketplace.json").name,
    );
  });
});
