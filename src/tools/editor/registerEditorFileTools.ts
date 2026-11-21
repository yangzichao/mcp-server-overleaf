import type { McpServer } from "@modelcontextprotocol/server";

import type { ToolContext } from "../toolContext.js";
import { registerEditorListFilesTool } from "./editorListFilesTool.js";
import { registerEditorReadFileTool } from "./editorReadFileTool.js";
import { registerEditorReplaceTextTool } from "./editorReplaceTextTool.js";

export function registerEditorFileTools(server: McpServer, context: ToolContext): void {
  registerEditorListFilesTool(server, context);
  registerEditorReadFileTool(server, context);
  registerEditorReplaceTextTool(server, context);
}
