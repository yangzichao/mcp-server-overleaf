import { ConfigurationError } from "../configurationError.js";
import type { RegisteredOverleafProject } from "../serverConfiguration.js";
import { parseRegisteredProjects } from "./parseRegisteredProjects.js";
import { loadProjectConfigurationFile } from "./projectConfigurationFile.js";
import { extractOverleafProjectId, looksLikeOverleafProjectId } from "./projectIdentity.js";

function validateProjectCredentials(
  registeredProjects: readonly RegisteredOverleafProject[],
  overleafGitToken: string,
  sessionCookieConfigured: boolean,
): void {
  const names = new Set<string>();
  const projectIds = new Set<string>();
  for (const project of registeredProjects) {
    if (
      looksLikeOverleafProjectId(project.projectName) &&
      project.projectName.toLowerCase() !== project.overleafProjectId
    ) {
      throw new ConfigurationError(
        "A project alias that looks like an Overleaf id must match its own project id.",
      );
    }
    if (names.has(project.projectName) || projectIds.has(project.overleafProjectId)) {
      throw new ConfigurationError(
        "Project names and ids must be unique; configure one credential per project.",
      );
    }
    names.add(project.projectName);
    projectIds.add(project.overleafProjectId);
  }

  // No credential anywhere is not an error: the server starts unconfigured and every call that
  // needs Overleaf says what to set (see missingOverleafCredential.ts). The desktop bundle can
  // only ask for its project address as required, so a user who fills in neither the token nor
  // the cookie lands here, and a server that exits looks broken rather than unconfigured.
  // With a session cookie, a project with no Git credential is still reachable through the
  // editor tools, which is the whole configuration on a plan without Git integration.
  const someProjectHasToken = registeredProjects.some((project) => Boolean(project.overleafGitToken));
  if (overleafGitToken || sessionCookieConfigured || !someProjectHasToken) return;

  // Some projects carry a token and others have none to fall back on: a half-written file.
  if (registeredProjects.some((project) => !project.overleafGitToken)) {
    throw new ConfigurationError(
      "OVERLEAF_GIT_TOKEN is not set and a registered project has no gitToken/gitTokenFile. " +
        "Without Git integration, set OVERLEAF_SESSION_COOKIE_FILE to reach it through the editor instead.",
    );
  }
}

/**
 * A desktop extension asks its user for one value, and what they can copy is the address
 * bar. Taking the URL here means every client that sets a single project gets the same
 * leniency the setup command already gives.
 */
function singleProjectEntry(environment: NodeJS.ProcessEnv): string {
  const reference = environment.OVERLEAF_PROJECT_ID?.trim() ?? "";
  const overleafProjectId = extractOverleafProjectId(reference);
  if (!overleafProjectId) {
    throw new ConfigurationError(
      `OVERLEAF_PROJECT_ID="${reference}" is neither a 24-character project id nor an Overleaf project URL.`,
    );
  }
  return `${environment.OVERLEAF_PROJECT_NAME?.trim() || "default"}=${overleafProjectId}`;
}

export function selectProjects(
  environment: NodeJS.ProcessEnv,
  overleafGitToken: string,
  sessionCookieConfigured: boolean,
) {
  // Explicit environment project selection wins as a whole, without merging credentials by position.
  const hasEnvironmentProjects = Boolean(
    environment.OVERLEAF_PROJECTS?.trim() || environment.OVERLEAF_PROJECT_ID?.trim(),
  );
  const projectFile = hasEnvironmentProjects ? undefined : loadProjectConfigurationFile(environment);
  const registeredProjects = hasEnvironmentProjects
    ? parseRegisteredProjects(environment.OVERLEAF_PROJECTS?.trim() || singleProjectEntry(environment))
    : (projectFile?.projects ?? []);
  validateProjectCredentials(registeredProjects, overleafGitToken, sessionCookieConfigured);
  const explicitDefault = environment.OVERLEAF_DEFAULT_PROJECT?.trim() || projectFile?.defaultProject;
  if (explicitDefault && !registeredProjects.some((project) => project.projectName === explicitDefault)) {
    throw new ConfigurationError(
      `OVERLEAF_DEFAULT_PROJECT="${explicitDefault}" is not present in OVERLEAF_PROJECTS or the project configuration file.`,
    );
  }
  const defaultProjectName =
    explicitDefault ??
    (registeredProjects.some((project) => project.projectName === "default")
      ? "default"
      : registeredProjects.length === 1
        ? (registeredProjects[0]?.projectName ?? null)
        : null);
  return { registeredProjects, defaultProjectName };
}
