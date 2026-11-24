import type { McpStdioClient } from "../mcpStdioClient.js";
import type { EditorTestHarness } from "./editorTestHarness.js";

/** A server with only the session cookie, so the editor versions of the file tools are listed. */
export function startCookieOnlyClient(harness: EditorTestHarness): Promise<McpStdioClient> {
  return harness.startClient({
    OVERLEAF_SESSION_COOKIE: harness.editor.cookieHeader,
    OVERLEAF_WEB_BASE_URL: harness.editor.baseUrl,
    OVERLEAF_PROJECTS: `paper=${harness.gitRemote.projectId}`,
    OVERLEAF_MCP_WORKSPACE_DIR: harness.gitRemote.workspaceDirectory,
    XDG_CONFIG_HOME: harness.gitRemote.workspaceDirectory,
  });
}

/** The text of a reply that came back as a tool error, or undefined when it was not one. */
export async function callExpectingError(
  client: McpStdioClient,
  toolName: string,
  toolArguments: Record<string, unknown>,
): Promise<string | undefined> {
  const response = await client.callRaw(toolName, toolArguments);
  return response.result?.isError === true ? (response.result.content?.[0]?.text ?? "") : undefined;
}
