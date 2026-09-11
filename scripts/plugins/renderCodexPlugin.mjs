/**
 * Builds the Codex half of the plugin: its manifest, and the marketplace entry listing it.
 *
 * Codex has no directory to submit to. `codex plugin marketplace add` takes a Git
 * repository and reads `.agents/plugins/marketplace.json` out of it, so this repository is
 * its own marketplace. Both documents are committed rather than built into `build/`,
 * because Codex clones the repository and reads them where they lie.
 */

import { pluginName } from "./renderSharedMcpServers.mjs";

const MARKETPLACE_NAME = "mcp-server-overleaf";
const BRAND_COLOR = "#1F2937";
const PRIVACY_POLICY_URL =
  "https://github.com/yangzichao/mcp-server-overleaf/blob/main/docs/privacy-policy.md";
const ICON_PATH = "./assets/icon.png";

const LONG_DESCRIPTION = `Read and edit your Overleaf papers from Codex.

The plugin runs this server over the Overleaf Git bridge and keeps the clone on your computer.
Codex can read the paper, search it, rewrite a section, and compile it locally. Nothing reaches
Overleaf until you approve push_changes, and every edit can be inspected with show_diff first.
If a co-author changed the same lines, the push stops and shows you both versions.

Add an Overleaf session cookie and three more tools appear. An edit then arrives in the editor
as a tracked-change suggestion your co-authors accept or reject, you can read what the review
panel already holds, and you can leave a comment on a passage.

Run \`npx --yes mcp-server-overleaf setup\` once before installing. It stores your Overleaf Git
token outside this plugin, so the plugin itself carries no credential.`;

/** Codex renders at most three starter prompts, so only three are worth writing. */
const DEFAULT_PROMPTS = [
  "List my Overleaf projects and summarise the default one.",
  "Rewrite the Introduction section, then show me the diff.",
  "Compile the project and report any LaTeX errors.",
];

export const codexMarketplaceName = MARKETPLACE_NAME;

export function renderCodexPluginManifest(packageMetadata) {
  return {
    name: pluginName,
    version: packageMetadata.version,
    description: packageMetadata.description,
    author: {
      name: packageMetadata.author,
      url: "https://github.com/yangzichao",
    },
    homepage: packageMetadata.homepage,
    repository: "https://github.com/yangzichao/mcp-server-overleaf",
    license: packageMetadata.license,
    keywords: packageMetadata.keywords,
    mcpServers: "./.mcp.json",
    interface: {
      displayName: "Overleaf",
      shortDescription: "Read and edit Overleaf papers, with tracked changes.",
      longDescription: LONG_DESCRIPTION,
      developerName: packageMetadata.author,
      category: "Productivity",
      capabilities: ["Read", "Write"],
      websiteURL: "https://github.com/yangzichao/mcp-server-overleaf",
      privacyPolicyURL: PRIVACY_POLICY_URL,
      defaultPrompt: DEFAULT_PROMPTS,
      brandColor: BRAND_COLOR,
      composerIcon: ICON_PATH,
      logo: ICON_PATH,
    },
  };
}

/** `path` is resolved against the marketplace root, which is the repository root here. */
export function renderCodexMarketplace() {
  return {
    name: MARKETPLACE_NAME,
    interface: { displayName: "Overleaf MCP server" },
    plugins: [
      {
        name: pluginName,
        source: { source: "local", path: `./plugins/${pluginName}` },
        policy: { installation: "AVAILABLE", authentication: "ON_USE" },
        category: "Productivity",
      },
    ],
  };
}
