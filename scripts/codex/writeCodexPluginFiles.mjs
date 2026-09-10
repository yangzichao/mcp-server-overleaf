import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBundleIcon } from "../mcpb/renderBundleIcon.mjs";
import {
  codexPluginName,
  renderMarketplace,
  renderPluginManifest,
  renderPluginMcpServers,
} from "./renderCodexPlugin.mjs";

/**
 * Rewrites the committed Codex plugin from `package.json`.
 *
 * Run this after a version bump. `tests/codex/renderCodexPlugin.test.ts` fails when the
 * committed files drift from what this writes, so the check suite catches a forgotten run.
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

const pluginRoot = join(packageRoot, "plugins", codexPluginName);
const marketplacePath = join(packageRoot, ".agents", "plugins", "marketplace.json");

function writeJsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

writeJsonFile(join(pluginRoot, ".codex-plugin", "plugin.json"), renderPluginManifest(packageMetadata));
writeJsonFile(join(pluginRoot, ".mcp.json"), renderPluginMcpServers(packageMetadata));
writeJsonFile(marketplacePath, renderMarketplace());

const iconPath = join(pluginRoot, "assets", "icon.png");
mkdirSync(dirname(iconPath), { recursive: true });
writeFileSync(iconPath, renderBundleIcon());

process.stdout.write(
  `Wrote the Codex plugin for ${packageMetadata.name}@${packageMetadata.version} into plugins/${codexPluginName}.\n`,
);
