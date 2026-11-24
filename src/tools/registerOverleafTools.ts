import type { McpServer } from "@modelcontextprotocol/server";

import { registerCompileProjectTool } from "./compiling/compileProjectTool.js";
import { registerEditFileTool } from "./editing/editFileTool.js";
import { registerManageFilesTool } from "./editing/manageFilesTool.js";
import { registerEditorCheckReferencesTool } from "./editor/editorCheckReferencesTool.js";
import { registerEditorEditFileTool } from "./editor/editorEditFileTool.js";
import { registerEditorManageFilesTool } from "./editor/editorFiles/editorManageFilesTool.js";
import { registerEditorLookUpCitationsTool } from "./editor/editorLookUpCitationsTool.js";
import { registerEditorReadFileTool } from "./editor/editorReadFileTool.js";
import { registerEditorReadProjectTool } from "./editor/editorReadProjectTool.js";
import { registerEditorSearchProjectTool } from "./editor/editorSearchProjectTool.js";
import { registerReadHistoryTool } from "./history/readHistoryTool.js";
import { registerCheckReferencesTool } from "./latex/checkReferencesTool.js";
import { registerLookUpCitationsTool } from "./latex/lookUpCitationsTool.js";
import type { OfferedToolGroups } from "./offeredToolGroups.js";
import { registerPushChangesTool } from "./publishing/pushChangesTool.js";
import { registerListProjectsTool } from "./reading/listProjectsTool.js";
import { registerReadFileTool } from "./reading/readFileTool.js";
import { registerReadProjectTool } from "./reading/readProjectTool.js";
import { registerSearchProjectTool } from "./reading/searchProjectTool.js";
import { registerManageCommentsTool } from "./review/manageCommentsTool.js";
import { registerManageTrackedChangesTool } from "./review/manageTrackedChangesTool.js";
import { registerReadReviewTool } from "./review/readReviewTool.js";
import type { ToolContext } from "./toolContext.js";
import { registerManageProjectTool } from "./web/manageProject/manageProjectTool.js";

/**
 * Every tool this server lists, read tools first. The Git-bridge group works on a local clone and
 * the session-cookie group on Overleaf's editor and web application; without a Git credential,
 * the file tools come in editor versions that need no clone.
 */
export function registerOverleafTools(
  server: McpServer,
  context: ToolContext,
  offered: OfferedToolGroups,
): void {
  registerListProjectsTool(server, context, offered);
  if (offered.gitBridgeToolsOffered) {
    registerReadProjectTool(server, context, offered);
    registerReadFileTool(server, context);
    registerSearchProjectTool(server, context);
    registerReadHistoryTool(server, context);
    registerCheckReferencesTool(server, context);
    registerLookUpCitationsTool(server, context);
  } else {
    registerEditorReadProjectTool(server, context);
    registerEditorReadFileTool(server, context);
    registerEditorSearchProjectTool(server, context);
    registerEditorCheckReferencesTool(server, context);
    registerEditorLookUpCitationsTool(server, context);
  }
  registerCompileProjectTool(server, context, offered);
  if (offered.sessionCookieToolsOffered) registerReadReviewTool(server, context);

  if (offered.gitBridgeToolsOffered) {
    registerEditFileTool(server, context);
    registerManageFilesTool(server, context, offered);
    registerPushChangesTool(server, context);
  } else {
    registerEditorEditFileTool(server, context);
    registerEditorManageFilesTool(server, context);
  }
  if (offered.sessionCookieToolsOffered) {
    registerManageTrackedChangesTool(server, context);
    registerManageCommentsTool(server, context);
    registerManageProjectTool(server, context);
  }
}
