import type { McpServer } from "@modelcontextprotocol/server";

import type { ToolContext } from "../toolContext.js";
import { registerAccountProjectTools } from "./accountProjectTools.js";
import { registerCompileOnOverleafTool } from "./compileOnOverleafTool.js";
import { registerDownloadProjectZipTool } from "./downloadProjectZipTool.js";

/**
 * Tools that use Overleaf's web application with the session cookie: the account's project
 * list, creating a project, compiling on Overleaf and downloading the source. Registered only
 * when a cookie is configured, like the review tools.
 */
export function registerWebTools(server: McpServer, context: ToolContext): void {
  registerAccountProjectTools(server, context);
  registerCompileOnOverleafTool(server, context);
  registerDownloadProjectZipTool(server, context);
}
