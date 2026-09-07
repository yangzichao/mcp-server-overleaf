import { McpServer } from "@modelcontextprotocol/server";

import type { ServerConfiguration } from "../config/serverConfiguration.js";
import { OverleafProjectRegistry } from "../overleaf/overleafProjectRegistry.js";
import { registerEditTools } from "../tools/registerEditTools.js";
import { registerReadTools } from "../tools/registerReadTools.js";
import { registerSyncTools } from "../tools/registerSyncTools.js";
import type { ToolContext } from "../tools/toolContext.js";

export const SERVER_NAME = "mcp-server-overleaf";
export const SERVER_VERSION = "0.1.0";

/**
 * Built once per process and shared by every transport, because it owns the clone
 * cache. Over HTTP a fresh McpServer is created per request, but it closes over this.
 */
export function createToolContext(configuration: ServerConfiguration): ToolContext {
  return { configuration, projectRegistry: new OverleafProjectRegistry(configuration) };
}

export function createOverleafMcpServer(context: ToolContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerReadTools(server, context);
  registerEditTools(server, context);
  registerSyncTools(server, context);
  return server;
}
