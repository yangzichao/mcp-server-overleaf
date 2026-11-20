import type { McpServer } from "@modelcontextprotocol/server";

import type { ToolContext } from "../toolContext.js";
import { registerEditorListFilesTool } from "./editorListFilesTool.js";
import { registerEditorReadFileTool } from "./editorReadFileTool.js";
import { registerEditorReplaceTextTool } from "./editorReplaceTextTool.js";

/**
 * list_files, read_file and replace_text over Overleaf's editor, for a server with a session
 * cookie and no Git credential: a plan without Git integration.
 *
 * They take the Git-bridge tools' names because those are not registered on such a server, so
 * a client sees one tool per name either way. Their descriptions say where they differ: there is
 * no clone, and an edit is live at once rather than waiting for push_changes.
 */
export function registerEditorFileTools(server: McpServer, context: ToolContext): void {
  registerEditorListFilesTool(server, context);
  registerEditorReadFileTool(server, context);
  registerEditorReplaceTextTool(server, context);
}
