import { renderPluginMcpServers } from "./renderSharedMcpServers.mjs";

export function renderGeminiCliExtension(packageMetadata) {
  return {
    name: packageMetadata.name,
    version: packageMetadata.version,
    description:
      "Read, edit, and compile shared Overleaf LaTeX projects from Gemini CLI. Git publishing is explicit and checks for co-author conflicts.",
    ...renderPluginMcpServers(packageMetadata),
  };
}
