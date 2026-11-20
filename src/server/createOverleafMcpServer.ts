import { McpServer } from "@modelcontextprotocol/server";

import { hasGitBridgeCredential } from "../config/missingOverleafCredential.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../config/packageMetadata.js";
import type { ServerConfiguration } from "../config/serverConfiguration.js";
import { OverleafProjectRegistry } from "../overleaf/overleafProjectRegistry.js";
import { OverleafWebClient } from "../overleaf/web/overleafWebClient.js";
import { registerHistoryTools } from "../tools/history/registerHistoryTools.js";
import { FileRevisionStore } from "../tools/reading/fileRevisions.js";
import { registerListProjectsTool } from "../tools/reading/listProjectsTool.js";
import { registerEditTools } from "../tools/registerEditTools.js";
import { registerReadTools } from "../tools/registerReadTools.js";
import { registerSyncTools } from "../tools/registerSyncTools.js";
import { registerReviewTools } from "../tools/review/registerReviewTools.js";
import type { ToolContext } from "../tools/toolContext.js";
import { registerWebTools } from "../tools/web/registerWebTools.js";
import { describeServerInstructions } from "./serverInstructions.js";

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
  const sessionCookieConfigured = context.configuration.reviewCredentials !== undefined;
  // A server with only a session cookie is the setup for a plan without Git integration: every
  // Git-bridge tool would answer with a setup note, so they are left out like the cookie tools
  // are left out without a cookie. A server with neither still lists them, so a directory's
  // sandbox, which starts it with no credentials, sees what the server offers.
  const gitBridgeToolsOffered = hasGitBridgeCredential(context.configuration) || !sessionCookieConfigured;
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: describeServerInstructions({
        gitBridgeToolsOffered,
        sessionCookieToolsOffered: sessionCookieConfigured,
      }),
    },
  );
  registerListProjectsTool(server, context);
  if (gitBridgeToolsOffered) {
    registerReadTools(server, context);
    registerEditTools(server, context);
    registerSyncTools(server, context);
    registerHistoryTools(server, context);
  }
  // Offered only when a session cookie is configured: a client that cannot use them is
  // better off not seeing them than seeing tools that always answer with a setup note.
  if (sessionCookieConfigured) {
    registerReviewTools(server, context);
    registerWebTools(server, context);
  }
  return server;
}
