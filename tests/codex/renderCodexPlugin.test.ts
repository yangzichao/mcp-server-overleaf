import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import * as codexPlugin from "../../scripts/codex/renderCodexPlugin.mjs";

const { codexMarketplaceName, codexPluginName, renderMarketplace, renderPluginManifest } = codexPlugin;
const { renderPluginMcpServers } = codexPlugin;

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

describe("renderCodexPlugin", () => {
  it("launches the exact npm version being released through npx on stdio", () => {
    const server = renderPluginMcpServers(packageMetadata).mcpServers[codexPluginName];
    expect(server.command).toBe("npx");
    expect(server.args).toEqual(["--yes", "mcp-server-overleaf@9.9.9", "--stdio"]);
  });

  it("carries no environment variables, so a committed plugin holds no credential", () => {
    const server = renderPluginMcpServers(packageMetadata).mcpServers[codexPluginName];
    expect(server.env).toBeUndefined();
  });

  it("versions the plugin with the server it installs", () => {
    expect(renderPluginManifest(packageMetadata).version).toBe("9.9.9");
  });

  it("points the manifest at the companion MCP file Codex reads", () => {
    expect(renderPluginManifest(packageMetadata).mcpServers).toBe("./.mcp.json");
  });

  it("offers at most the three starter prompts Codex renders", () => {
    expect(renderPluginManifest(packageMetadata).interface.defaultPrompt).toHaveLength(3);
  });

  it("resolves the plugin path against the repository root Codex clones", () => {
    const [entry] = renderMarketplace().plugins;
    expect(entry.name).toBe(codexPluginName);
    expect(entry.source).toEqual({ source: "local", path: `./plugins/${codexPluginName}` });
    expect(entry.policy).toEqual({ installation: "AVAILABLE", authentication: "ON_USE" });
  });
});

describe("the committed Codex plugin", () => {
  const realMetadata = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  it("matches the manifest the renderer produces", () => {
    expect(readCommittedJson(`plugins/${codexPluginName}/.codex-plugin/plugin.json`)).toEqual(
      renderPluginManifest(realMetadata),
    );
  });

  it("matches the MCP configuration the renderer produces", () => {
    expect(readCommittedJson(`plugins/${codexPluginName}/.mcp.json`)).toEqual(
      renderPluginMcpServers(realMetadata),
    );
  });

  it("matches the marketplace entry the renderer produces", () => {
    expect(readCommittedJson(".agents/plugins/marketplace.json")).toEqual(renderMarketplace());
  });

  it("is listed under the marketplace name the install command names", () => {
    expect(readCommittedJson(".agents/plugins/marketplace.json").name).toBe(codexMarketplaceName);
  });
});
