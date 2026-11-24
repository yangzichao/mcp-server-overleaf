import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { renderBundleManifest } from "../../scripts/mcpb/renderBundleManifest.mjs";
// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { renderCodexPluginManifest } from "../../scripts/plugins/renderCodexPlugin.mjs";

/** The tools tests/integration/protocol/toolCatalogByConfiguration.test.ts pins. */
const TOOL_NAMES = new Set([
  "list_projects",
  "read_project",
  "read_file",
  "search_project",
  "read_history",
  "check_references",
  "look_up_citations",
  "compile_project",
  "read_review",
  "edit_file",
  "manage_files",
  "push_changes",
  "manage_tracked_changes",
  "manage_comments",
  "manage_project",
]);

const packageMetadata = {
  name: "mcp-server-overleaf",
  version: "9.9.9",
  description: "MCP server for Overleaf.",
  author: "Zichao Yang",
  license: "MIT",
  homepage: "https://github.com/yangzichao/mcp-server-overleaf#readme",
  bugs: { url: "https://github.com/yangzichao/mcp-server-overleaf/issues" },
  repository: { url: "git+https://github.com/yangzichao/mcp-server-overleaf.git" },
  keywords: ["mcp", "overleaf"],
};

const STOREFRONT_TEXTS: ReadonlyArray<[string, string]> = [
  [
    "the desktop bundle's long description",
    renderBundleManifest({
      packageMetadata,
      tools: [{ name: "read_file", description: "Read a file." }],
      entryPoint: "server/dist/index.js",
      iconPath: "icon.png",
    }).long_description,
  ],
  [
    "the Codex plugin's long description",
    renderCodexPluginManifest(packageMetadata).interface.longDescription,
  ],
  ...renderCodexPluginManifest(packageMetadata).interface.defaultPrompt.map(
    (prompt: string, index: number): [string, string] => [`Codex starter prompt ${index + 1}`, prompt],
  ),
];

describe.each(STOREFRONT_TEXTS)("%s", (_label, text) => {
  it("names only tools the server offers", () => {
    for (const word of text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) {
      expect(TOOL_NAMES, `names ${word}`).toContain(word);
    }
  });

  it("has no em or en dashes", () => {
    expect(text).not.toMatch(/[–—]/);
  });
});
