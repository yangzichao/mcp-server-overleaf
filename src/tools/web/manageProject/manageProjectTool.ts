import type { McpServer } from "@modelcontextprotocol/server";

import { runSelectedOperation } from "../../actions/toolOperations.js";
import { PersonConfirmation } from "../../personConfirmation/personConfirmation.js";
import { WRITES_TO_OVERLEAF } from "../../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../../toolContext.js";
import { manageProjectActions } from "./manageProjectActions.js";
import { MANAGE_PROJECT_DESCRIPTION } from "./manageProjectDescription.js";
import { manageProjectInput } from "./manageProjectInput.js";

export function registerManageProjectTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "manage_project",
    {
      title: "Manage Overleaf projects",
      description: MANAGE_PROJECT_DESCRIPTION,
      inputSchema: manageProjectInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    (input, requestContext) =>
      runToolSafely(context, () =>
        runSelectedOperation(
          input.action,
          manageProjectActions(context, PersonConfirmation.forRequest(server, requestContext)),
          input,
          ["action"],
        ),
      ),
  );
}
