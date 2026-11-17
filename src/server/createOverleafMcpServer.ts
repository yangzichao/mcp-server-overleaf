import { McpServer } from "@modelcontextprotocol/server";

import { PACKAGE_NAME, PACKAGE_VERSION } from "../config/packageMetadata.js";
import type { ServerConfiguration } from "../config/serverConfiguration.js";
import { OverleafProjectRegistry } from "../overleaf/overleafProjectRegistry.js";
import { OverleafWebClient } from "../overleaf/web/overleafWebClient.js";
import { FileRevisionStore } from "../tools/reading/fileRevisions.js";
import { registerEditTools } from "../tools/registerEditTools.js";
import { registerReadTools } from "../tools/registerReadTools.js";
import { registerSyncTools } from "../tools/registerSyncTools.js";
import { registerReviewTools } from "../tools/review/registerReviewTools.js";
import type { ToolContext } from "../tools/toolContext.js";
import { registerWebTools } from "../tools/web/registerWebTools.js";

export const SERVER_NAME = PACKAGE_NAME;
export const SERVER_VERSION = PACKAGE_VERSION;

/**
 * Built once per process and shared by every transport, because it owns the clone
 * cache. Over HTTP a fresh McpServer is created per request, but it closes over this.
 */
export function createToolContext(configuration: ServerConfiguration): ToolContext {
  return {
    configuration,
    projectRegistry: new OverleafProjectRegistry(configuration),
    fileRevisions: new FileRevisionStore(),
    overleafWebClient: configuration.reviewCredentials
      ? new OverleafWebClient({
          baseUrl: configuration.reviewCredentials.webBaseUrl,
          cookieHeader: configuration.reviewCredentials.cookieHeader,
        })
      : undefined,
  };
}

export function createOverleafMcpServer(context: ToolContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerReadTools(server, context);
  registerEditTools(server, context);
  registerSyncTools(server, context);
  // Offered only when a session cookie is configured: a client that cannot use them is
  // better off not seeing them than seeing tools that always answer with a setup note.
  if (context.configuration.reviewCredentials) {
    registerReviewTools(server, context);
    registerWebTools(server, context);
  }
  return server;
}
