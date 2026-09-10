/**
 * The one MCP server both plugin manifests point at.
 *
 * Claude Code and Codex read the same `.mcp.json` from the plugin root, so the server is
 * described once and neither client can end up with a different launch command.
 */

export const pluginName = "overleaf";
export const mcpServerName = "overleaf";

/**
 * No environment variables on purpose. This file is published in a public repository, so
 * it must not be able to carry a credential even by accident. The server finds its own
 * per-user `projects.json`, which is where `setup` writes the token.
 */
export function renderPluginMcpServers(packageMetadata) {
  return {
    mcpServers: {
      [mcpServerName]: {
        command: "npx",
        args: ["--yes", `${packageMetadata.name}@${packageMetadata.version}`, "--stdio"],
      },
    },
  };
}
