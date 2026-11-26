import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { renderGeminiCliExtension } from "../../scripts/plugins/renderGeminiCliExtension.mjs";

describe("the Gemini CLI extension manifest", () => {
  it("uses the same release and local server configuration as the Claude Code and Codex plugins", () => {
    const packageMetadata = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const manifest = JSON.parse(
      readFileSync(new URL("../../gemini-extension.json", import.meta.url), "utf8"),
    );
    const pluginConfig = JSON.parse(
      readFileSync(new URL("../../plugins/overleaf/.mcp.json", import.meta.url), "utf8"),
    );

    expect(manifest).toEqual(renderGeminiCliExtension(packageMetadata));
    expect(manifest.name).toBe(packageMetadata.name);
    expect(manifest.version).toBe(packageMetadata.version);
    expect(manifest.mcpServers).toEqual(pluginConfig.mcpServers);
  });
});
