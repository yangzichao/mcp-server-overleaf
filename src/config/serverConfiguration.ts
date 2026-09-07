import { homedir } from "node:os";
import { resolve } from "node:path";

export interface RegisteredOverleafProject {
  readonly projectName: string;
  readonly overleafProjectId: string;
}

export interface ServerConfiguration {
  readonly overleafGitToken: string;
  readonly overleafGitBaseUrl: string;
  readonly workspaceDirectory: string;
  readonly registeredProjects: readonly RegisteredOverleafProject[];
  readonly defaultProjectName: string | null;
  readonly compileTimeoutMs: number;
  readonly gitCommitAuthorName: string;
  readonly gitCommitAuthorEmail: string;
}

export class ConfigurationError extends Error {}

const OVERLEAF_PROJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

export function looksLikeOverleafProjectId(candidate: string): boolean {
  return OVERLEAF_PROJECT_ID_PATTERN.test(candidate.trim());
}

/**
 * Parses `OVERLEAF_PROJECTS` in the form `paper=64a1...,thesis=65b2...`.
 * A bare project id with no name is registered under its own id.
 */
function parseRegisteredProjects(rawValue: string | undefined): RegisteredOverleafProject[] {
  if (!rawValue || rawValue.trim() === "") return [];

  return rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) {
        if (!looksLikeOverleafProjectId(entry)) {
          throw new ConfigurationError(
            `OVERLEAF_PROJECTS entry "${entry}" is neither "name=projectId" nor a 24-character Overleaf project id.`,
          );
        }
        return { projectName: entry, overleafProjectId: entry };
      }

      const projectName = entry.slice(0, separatorIndex).trim();
      const overleafProjectId = entry.slice(separatorIndex + 1).trim();
      if (projectName === "" || overleafProjectId === "") {
        throw new ConfigurationError(`OVERLEAF_PROJECTS entry "${entry}" is missing a name or a project id.`);
      }
      return { projectName, overleafProjectId };
    });
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number, variableName: string): number {
  if (rawValue === undefined || rawValue.trim() === "") return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigurationError(`${variableName} must be a positive integer, received "${rawValue}".`);
  }
  return parsed;
}

export function loadServerConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfiguration {
  const overleafGitToken = environment.OVERLEAF_GIT_TOKEN?.trim();
  if (!overleafGitToken) {
    throw new ConfigurationError(
      "OVERLEAF_GIT_TOKEN is not set. Generate a git authentication token at " +
        "https://www.overleaf.com/user/settings and pass it through the MCP client's env block.",
    );
  }

  const registeredProjects = parseRegisteredProjects(environment.OVERLEAF_PROJECTS);
  const explicitDefault = environment.OVERLEAF_DEFAULT_PROJECT?.trim();
  if (explicitDefault && !registeredProjects.some((project) => project.projectName === explicitDefault)) {
    throw new ConfigurationError(
      `OVERLEAF_DEFAULT_PROJECT="${explicitDefault}" is not present in OVERLEAF_PROJECTS.`,
    );
  }

  const onlyRegisteredProject = registeredProjects.length === 1 ? registeredProjects[0] : undefined;
  const defaultProjectName = explicitDefault ?? onlyRegisteredProject?.projectName ?? null;

  const configuredWorkspaceDirectory = environment.OVERLEAF_MCP_WORKSPACE_DIR?.trim();
  const workspaceDirectory = configuredWorkspaceDirectory
    ? resolve(configuredWorkspaceDirectory)
    : resolve(homedir(), ".overleaf-mcp", "projects");

  return {
    overleafGitToken,
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
