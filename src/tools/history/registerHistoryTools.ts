import type { McpServer } from "@modelcontextprotocol/server";

import type { ToolContext } from "../toolContext.js";
import { registerListHistoryTool } from "./listHistoryTool.js";
import { registerRestoreFileTool } from "./restoreFileTool.js";

/** The project's past through the Git bridge: listing it and bringing a file back from it. */
export function registerHistoryTools(server: McpServer, context: ToolContext): void {
  registerListHistoryTool(server, context);
  registerRestoreFileTool(server, context);
}
