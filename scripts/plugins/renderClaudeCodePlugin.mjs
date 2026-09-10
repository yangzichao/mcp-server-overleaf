/**
 * Builds the Claude Code half of the plugin: its manifest, and the marketplace listing it.
 *
 * `claude plugin marketplace add` takes a GitHub repository and reads
 * `.claude-plugin/marketplace.json` out of it, the same arrangement Codex uses with a
 * different filename. The plugin directory is shared: Claude Code reads `.mcp.json` from
 * the plugin root by convention, so this manifest does not name it.
 */

import { pluginName } from "./renderSharedMcpServers.mjs";

const MARKETPLACE_NAME = "mcp-server-overleaf";

const PLUGIN_DESCRIPTION =
  "Read and safely edit Overleaf projects over the Overleaf Git bridge. Edits stay in a local clone until you approve a push, and a co-author's conflicting change stops the push rather than being overwritten.";

export const claudeCodeMarketplaceName = MARKETPLACE_NAME;

export function renderClaudeCodePluginManifest(packageMetadata) {
  return {
    name: pluginName,
    description: PLUGIN_DESCRIPTION,
    version: packageMetadata.version,
    author: {
      name: packageMetadata.author,
      url: "https://github.com/yangzichao",
    },
    homepage: packageMetadata.homepage,
    repository: "https://github.com/yangzichao/mcp-server-overleaf",
    license: packageMetadata.license,
    keywords: packageMetadata.keywords,
  };
}

/** `source` is resolved against the repository Claude Code cloned. */
export function renderClaudeCodeMarketplace(packageMetadata) {
  return {
    name: MARKETPLACE_NAME,
    owner: {
      name: packageMetadata.author,
      url: "https://github.com/yangzichao",
    },
    metadata: { description: packageMetadata.description },
    plugins: [
      {
        name: pluginName,
        source: `./plugins/${pluginName}`,
        description: PLUGIN_DESCRIPTION,
      },
    ],
  };
}
