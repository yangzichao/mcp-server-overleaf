import type { EditorTestHarness } from "../../integration/support/editorTestHarness.js";

/** The credentials a person can give the server, named the way the feature files name them. */
const SERVER_CREDENTIALS = [
  "a Git token and a session cookie",
  "only a Git token",
  "only a session cookie",
  "only a session cookie and no registered project",
] as const;

export type ServerCredentials = (typeof SERVER_CREDENTIALS)[number];

export function parseServerCredentials(text: string): ServerCredentials {
  const credentials = SERVER_CREDENTIALS.find((candidate) => candidate === text);
  if (!credentials)
    throw new Error(`Unknown credentials "${text}". Known: ${SERVER_CREDENTIALS.join("; ")}.`);
  return credentials;
}

export function environmentForCredentials(
  harness: EditorTestHarness,
  credentials: ServerCredentials,
): NodeJS.ProcessEnv {
  if (credentials === "a Git token and a session cookie") return harness.reviewEnvironment();
  if (credentials === "only a Git token") return harness.gitRemote.environment();

  const sessionCookieOnly: NodeJS.ProcessEnv = {
    OVERLEAF_SESSION_COOKIE: harness.editor.cookieHeader,
    OVERLEAF_WEB_BASE_URL: harness.editor.baseUrl,
    OVERLEAF_MCP_WORKSPACE_DIR: harness.gitRemote.workspaceDirectory,
    // Keeps a configuration file on the developer's machine from being read.
    XDG_CONFIG_HOME: harness.gitRemote.workspaceDirectory,
  };
  if (credentials === "only a session cookie and no registered project") return sessionCookieOnly;
  return { ...sessionCookieOnly, OVERLEAF_PROJECTS: `paper=${harness.gitRemote.projectId}` };
}
