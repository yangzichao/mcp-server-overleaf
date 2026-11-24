import { McpServer } from "@modelcontextprotocol/server";

import { PACKAGE_NAME, PACKAGE_VERSION } from "../config/packageMetadata.js";
import type { ServerConfiguration } from "../config/serverConfiguration.js";
import { OverleafProjectRegistry } from "../overleaf/overleafProjectRegistry.js";
import { OverleafWebClient } from "../overleaf/web/overleafWebClient.js";
import { registerOverleafPrompts } from "../prompts/registerOverleafPrompts.js";
import { decideOfferedToolGroups } from "../tools/offeredToolGroups.js";
import { FileRevisionStore } from "../tools/reading/fileRevisions.js";
import { registerOverleafTools } from "../tools/registerOverleafTools.js";
import type { ToolContext } from "../tools/toolContext.js";
import { describeServerInstructions } from "./serverInstructions.js";

const SERVER_NAME = PACKAGE_NAME;
const SERVER_VERSION = PACKAGE_VERSION;

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
  const offered = decideOfferedToolGroups(context.configuration);
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: describeServerInstructions(offered) },
  );
  registerOverleafTools(server, context, offered);
  registerOverleafPrompts(server, {
    gitBridge: offered.gitBridgeToolsOffered,
    sessionCookie: offered.sessionCookieToolsOffered,
  });
  return server;
}
