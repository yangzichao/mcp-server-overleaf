import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import * as codexPlugin from "../../scripts/plugins/renderCodexPlugin.mjs";
// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { pluginName } from "../../scripts/plugins/renderSharedMcpServers.mjs";

const { codexMarketplaceName, renderCodexMarketplace, renderCodexPluginManifest } = codexPlugin;

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

describe("renderCodexPluginManifest", () => {
  it("versions the plugin with the server it installs", () => {
    expect(renderCodexPluginManifest(packageMetadata).version).toBe("9.9.9");
  });

  it("points at the companion MCP file Codex reads", () => {
    expect(renderCodexPluginManifest(packageMetadata).mcpServers).toBe("./.mcp.json");
  });

  it("offers at most the three starter prompts Codex renders", () => {
    expect(renderCodexPluginManifest(packageMetadata).interface.defaultPrompt).toHaveLength(3);
  });

  it("gives Codex the https policy URLs its validator requires", () => {
    const { websiteURL, privacyPolicyURL } = renderCodexPluginManifest(packageMetadata).interface;
    expect(websiteURL).toMatch(/^https:\/\//);
    expect(privacyPolicyURL).toMatch(/^https:\/\//);
  });
});

describe("renderCodexMarketplace", () => {
  it("resolves the plugin path against the repository root Codex clones", () => {
    const [entry] = renderCodexMarketplace().plugins;
    expect(entry.name).toBe(pluginName);
    expect(entry.source).toEqual({ source: "local", path: `./plugins/${pluginName}` });
    expect(entry.policy).toEqual({ installation: "AVAILABLE", authentication: "ON_USE" });
  });
});

describe("the committed Codex plugin", () => {
  const realMetadata = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  it("matches the manifest the renderer produces", () => {
    expect(readCommittedJson(`plugins/${pluginName}/.codex-plugin/plugin.json`)).toEqual(
      renderCodexPluginManifest(realMetadata),
    );
  });

  it("matches the marketplace entry the renderer produces", () => {
    expect(readCommittedJson(".agents/plugins/marketplace.json")).toEqual(renderCodexMarketplace());
  });

  it("is listed under the marketplace name the install command names", () => {
    expect(readCommittedJson(".agents/plugins/marketplace.json").name).toBe(codexMarketplaceName);
  });
});
