import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBundleIcon } from "../mcpb/renderBundleIcon.mjs";
import { renderClaudeCodeMarketplace, renderClaudeCodePluginManifest } from "./renderClaudeCodePlugin.mjs";
import { renderCodexMarketplace, renderCodexPluginManifest } from "./renderCodexPlugin.mjs";
import { pluginName, renderPluginMcpServers } from "./renderSharedMcpServers.mjs";

/**
 * Rewrites the committed Claude Code and Codex plugins from `package.json`.
 *
 * Run this after a version bump. `tests/plugins/` fails when the committed files drift
 * from what this writes, so the check suite catches a forgotten run.
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const pluginRoot = join(packageRoot, "plugins", pluginName);

function writeJsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

writeJsonFile(join(pluginRoot, ".mcp.json"), renderPluginMcpServers(packageMetadata));

writeJsonFile(
  join(pluginRoot, ".claude-plugin", "plugin.json"),
  renderClaudeCodePluginManifest(packageMetadata),
);
writeJsonFile(
  join(packageRoot, ".claude-plugin", "marketplace.json"),
  renderClaudeCodeMarketplace(packageMetadata),
);

writeJsonFile(join(pluginRoot, ".codex-plugin", "plugin.json"), renderCodexPluginManifest(packageMetadata));
writeJsonFile(join(packageRoot, ".agents", "plugins", "marketplace.json"), renderCodexMarketplace());

const iconPath = join(pluginRoot, "assets", "icon.png");
mkdirSync(dirname(iconPath), { recursive: true });
writeFileSync(iconPath, renderBundleIcon());

process.stdout.write(
  `Wrote the Claude Code and Codex plugins for ${packageMetadata.name}@${packageMetadata.version} into plugins/${pluginName}.\n`,
);
