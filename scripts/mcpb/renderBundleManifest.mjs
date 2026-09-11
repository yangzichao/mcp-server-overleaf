/**
 * Builds the `manifest.json` that Claude Desktop reads when it installs the bundle.
 *
 * The tool list is passed in rather than written here: it is read back from the server
 * that is about to be packed, so the manifest cannot describe a tool surface the bundle
 * does not actually have.
 */

const MANIFEST_VERSION = "0.3";
const PRIVACY_POLICY_URL =
  "https://github.com/yangzichao/mcp-server-overleaf/blob/main/docs/privacy-policy.md";

const LONG_DESCRIPTION = `Read and edit your Overleaf papers from Claude Desktop.

The extension clones your Overleaf project over the Overleaf Git bridge and keeps the copy on
your computer. Claude can read the paper, search it, rewrite a section, and compile it locally.
Nothing reaches Overleaf until you approve \`push_changes\`, and every edit can be inspected with
\`show_diff\` first. If a co-author changed the same lines, the push stops and shows you both
versions rather than picking a winner.

Add an Overleaf session cookie and three more tools appear. An edit then arrives in the editor
as a tracked-change suggestion your co-authors accept or reject, you can read what the review
panel already holds, and you can leave a comment on a passage.

Requires an Overleaf plan that includes Git integration, and a Git authentication token from
your Overleaf account settings.`;

export function renderBundleManifest({ packageMetadata, tools, entryPoint, iconPath }) {
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error("The bundle manifest needs the tool list read back from the packed server.");
  }
  const overlongName = tools.find((tool) => tool.name.length > 64);
  if (overlongName) {
    throw new Error(`Tool name "${overlongName.name}" is longer than the 64 characters MCPB allows.`);
  }

  return {
    manifest_version: MANIFEST_VERSION,
    name: packageMetadata.name,
    display_name: "Overleaf",
    version: packageMetadata.version,
    description: packageMetadata.description,
    long_description: LONG_DESCRIPTION,
    author: {
      name: packageMetadata.author,
      url: "https://github.com/yangzichao",
    },
    homepage: packageMetadata.homepage,
    documentation: "https://github.com/yangzichao/mcp-server-overleaf#readme",
    support: packageMetadata.bugs.url,
    repository: { type: "git", url: packageMetadata.repository.url },
    license: packageMetadata.license,
    keywords: packageMetadata.keywords,
    privacy_policies: [PRIVACY_POLICY_URL],
    icon: iconPath,
    server: {
      type: "node",
      entry_point: entryPoint,
      mcp_config: {
        command: "node",
        args: [`\${__dirname}/${entryPoint}`, "--stdio"],
        // biome-ignore-start lint/suspicious/noTemplateCurlyInString: MCPB's own
        // substitution syntax. Claude Desktop replaces these with the user's answers.
        env: {
          OVERLEAF_GIT_TOKEN: "${user_config.overleaf_git_token}",
          OVERLEAF_PROJECT_ID: "${user_config.overleaf_project_url}",
          OVERLEAF_SESSION_COOKIE: "${user_config.overleaf_session_cookie}",
        },
        // biome-ignore-end lint/suspicious/noTemplateCurlyInString: end of MCPB syntax
      },
    },
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
    tools_generated: false,
    user_config: {
      overleaf_git_token: {
        type: "string",
        title: "Overleaf Git token",
        description:
          "Create one at https://www.overleaf.com/user/settings under Git integration. Any account can generate one, and it expires after a year. Whether Git works for a given paper depends on the subscription of whoever owns it.",
        required: true,
        sensitive: true,
      },
      overleaf_project_url: {
        type: "string",
        title: "Overleaf project address",
        description:
          "Open the project in Overleaf and copy the address from the browser, for example https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1",
        required: true,
        sensitive: false,
      },
      overleaf_session_cookie: {
        type: "string",
        title: "Overleaf session cookie (optional)",
        description:
          "Leave empty unless you want edits to arrive as suggestions in Overleaf's review panel. That needs your browser session rather than the Git token, so it covers your whole account and stops working when you sign out. Copy the value of the overleaf_session2 cookie from a browser where you are signed in to Overleaf.",
        required: false,
        sensitive: true,
      },
    },
    compatibility: {
      // Claude Desktop ships for macOS and Windows only, and provides the Node runtime.
      platforms: ["darwin", "win32"],
    },
  };
}
