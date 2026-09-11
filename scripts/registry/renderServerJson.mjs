/**
 * Builds the `server.json` the official MCP registry publishes.
 *
 * The registry is metadata only: it stores this document and points clients at npm and at
 * the GitHub release, so every version and URL in here has to name something that already
 * exists. Nothing is invented locally.
 */

const SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const REGISTRY_NAMESPACE = "io.github.yangzichao";
const GITHUB_REPOSITORY_ID = "1359726349";
const DESCRIPTION_LIMIT = 100;

function npmPackage(packageMetadata) {
  return {
    registryType: "npm",
    registryBaseUrl: "https://registry.npmjs.org",
    identifier: packageMetadata.name,
    version: packageMetadata.version,
    runtimeHint: "npx",
    transport: { type: "stdio" },
    packageArguments: [
      {
        type: "positional",
        value: "--stdio",
        valueHint: "transport",
        description: "Serve on stdio, which is the transport a local client starts.",
      },
    ],
    environmentVariables: [
      {
        name: "OVERLEAF_GIT_TOKEN",
        description:
          "Overleaf Git authentication token, from https://www.overleaf.com/user/settings under Git integration.",
        isRequired: true,
        isSecret: true,
      },
      {
        name: "OVERLEAF_PROJECT_ID",
        description:
          "The project to open: its 24-character id, or the Overleaf address bar URL that contains it.",
        isRequired: true,
        isSecret: false,
      },
      {
        name: "OVERLEAF_SESSION_COOKIE",
        description:
          "Optional. An Overleaf browser session cookie, which turns on the tracked-changes tools: suggest an edit, read the review panel, leave a comment.",
        isRequired: false,
        isSecret: true,
      },
    ],
  };
}

/** The bundle is a direct download, so the registry requires its hash rather than a version. */
function desktopBundlePackage({ downloadUrl, fileSha256 }) {
  return {
    registryType: "mcpb",
    identifier: downloadUrl,
    fileSha256,
    transport: { type: "stdio" },
  };
}

export function serverRegistryName(packageMetadata) {
  return `${REGISTRY_NAMESPACE}/${packageMetadata.name}`;
}

export function renderServerJson({ packageMetadata, desktopBundle }) {
  if (packageMetadata.description.length > DESCRIPTION_LIMIT) {
    throw new Error(
      `The registry caps description at ${DESCRIPTION_LIMIT} characters; package.json has ${packageMetadata.description.length}.`,
    );
  }
  const registryName = serverRegistryName(packageMetadata);
  if (packageMetadata.mcpName !== registryName) {
    throw new Error(
      `package.json mcpName is "${packageMetadata.mcpName}" but the registry name is "${registryName}". The registry proves npm ownership by comparing the two.`,
    );
  }

  return {
    $schema: SCHEMA_URL,
    name: registryName,
    title: "Overleaf",
    description: packageMetadata.description,
    version: packageMetadata.version,
    websiteUrl: packageMetadata.homepage,
    repository: {
      url: "https://github.com/yangzichao/mcp-server-overleaf",
      source: "github",
      id: GITHUB_REPOSITORY_ID,
    },
    packages: desktopBundle
      ? [npmPackage(packageMetadata), desktopBundlePackage(desktopBundle)]
      : [npmPackage(packageMetadata)],
  };
}
