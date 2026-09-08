import { homedir } from "node:os";
import { resolve } from "node:path";
import { ConfigurationError } from "./configurationError.js";
import { resolveGitToken } from "./projects/projectCredentials.js";
import { selectProjects } from "./projects/projectSelection.js";

export { ConfigurationError } from "./configurationError.js";
export { looksLikeOverleafProjectId } from "./projects/projectIdentity.js";

export interface RegisteredOverleafProject {
  readonly projectName: string;
  readonly overleafProjectId: string;
  readonly displayName?: string;
  readonly overleafGitToken?: string;
}

export interface ServerConfiguration {
  readonly overleafGitToken: string;
  readonly overleafGitBaseUrl: string;
  readonly workspaceDirectory: string;
  readonly registeredProjects: readonly RegisteredOverleafProject[];
  readonly defaultProjectName: string | null;
  readonly compileTimeoutMs: number;
  readonly checkoutMode?: "full" | "text-only";
  readonly gitCommitAuthorName: string;
  readonly gitCommitAuthorEmail: string;
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number, variableName: string): number {
  if (rawValue === undefined || rawValue.trim() === "") return fallback;
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigurationError(`${variableName} must be a positive integer, received "${rawValue}".`);
  }
  return parsed;
}

export function loadServerConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfiguration {
  const overleafGitToken = resolveGitToken(
    environment.OVERLEAF_GIT_TOKEN,
    environment.OVERLEAF_GIT_TOKEN_FILE,
  );
  const { registeredProjects, defaultProjectName } = selectProjects(environment, overleafGitToken);
  const checkoutMode = environment.OVERLEAF_MCP_CHECKOUT_MODE?.trim() || "full";
  if (checkoutMode !== "full" && checkoutMode !== "text-only") {
    throw new ConfigurationError("OVERLEAF_MCP_CHECKOUT_MODE must be full or text-only.");
  }

  const configuredWorkspaceDirectory = environment.OVERLEAF_MCP_WORKSPACE_DIR?.trim();
  const workspaceDirectory = configuredWorkspaceDirectory
    ? resolve(configuredWorkspaceDirectory)
    : resolve(homedir(), ".overleaf-mcp", "projects");

  return {
    overleafGitToken,
    checkoutMode,
    overleafGitBaseUrl: (environment.OVERLEAF_GIT_BASE_URL?.trim() || "https://git.overleaf.com").replace(
      /\/+$/,
      "",
    ),
    workspaceDirectory,
    registeredProjects,
    defaultProjectName,
    compileTimeoutMs: parsePositiveInteger(
      environment.OVERLEAF_MCP_COMPILE_TIMEOUT_MS,
      180_000,
      "OVERLEAF_MCP_COMPILE_TIMEOUT_MS",
    ),
    gitCommitAuthorName: environment.OVERLEAF_MCP_GIT_AUTHOR_NAME?.trim() || "mcp-server-overleaf",
    gitCommitAuthorEmail:
      environment.OVERLEAF_MCP_GIT_AUTHOR_EMAIL?.trim() || "mcp-server-overleaf@localhost",
  };
}
