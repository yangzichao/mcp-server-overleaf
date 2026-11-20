import type { ServerConfiguration } from "./serverConfiguration.js";

/**
 * What every call that needs Overleaf answers when nothing at all is configured.
 *
 * The server starts anyway. Glama's sandbox, for one, starts it with no credentials, and a
 * server that exits there looks broken rather than unconfigured.
 */
export const MISSING_OVERLEAF_CREDENTIAL_MESSAGE =
  "OVERLEAF_GIT_TOKEN is not set, so this server cannot reach Overleaf yet. " +
  "Configure a token, token file, or OVERLEAF_PROJECTS_CONFIG, or run `npx mcp-server-overleaf setup`. " +
  "On a plan without Git integration, set OVERLEAF_SESSION_COOKIE_FILE instead to use the editor tools.";

/**
 * Whether the Git-bridge tools can reach any project. A project registered without a token of its
 * own is covered only by the default token: with a session cookie configured, a project may be
 * registered for the editor tools alone.
 */
export function hasGitBridgeCredential(configuration: ServerConfiguration): boolean {
  return (
    configuration.overleafGitToken !== "" ||
    configuration.registeredProjects.some((project) => Boolean(project.overleafGitToken))
  );
}

/** Whether anything at all can reach Overleaf: a Git credential, a session cookie, or both. */
export function hasAnyOverleafCredential(configuration: ServerConfiguration): boolean {
  return hasGitBridgeCredential(configuration) || configuration.reviewCredentials !== undefined;
}
