import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hostHeaderValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

import type { HttpTransportConfiguration } from "../config/httpTransportConfiguration.js";
import { createOverleafMcpServer } from "../server/createOverleafMcpServer.js";
import type { ToolContext } from "../tools/toolContext.js";

function bearerTokenMatches(presentedToken: string, expectedToken: string): boolean {
  const presented = Buffer.from(presentedToken);
  const expected = Buffer.from(expectedToken);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

function isAuthorized(request: IncomingMessage, expectedToken: string | null): boolean {
  if (expectedToken === null) return true;
  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  return bearerTokenMatches(authorizationHeader.slice("Bearer ".length).trim(), expectedToken);
}

function rejectUnauthorized(response: ServerResponse): void {
  response.writeHead(401, {
    "content-type": "application/json",
    "www-authenticate": 'Bearer realm="mcp-server-overleaf"',
  });
  response.end(JSON.stringify({ error: "unauthorized" }));
}

/**
 * For remote MCP clients that connect over the network instead of spawning a process.
 *
 * The tool implementations are shared verbatim with the stdio transport; only the
 * framing differs. Requests are rejected before they reach the MCP handler unless
 * they carry the configured bearer token.
 */
export async function serveOverStreamableHttp(
  context: ToolContext,
  httpConfiguration: HttpTransportConfiguration,
): Promise<void> {
  const handler = createMcpHandler(() => createOverleafMcpServer(context));
  const nodeHandler = toNodeHandler(handler);
  const validateHostHeader = hostHeaderValidation([httpConfiguration.host, "localhost", "127.0.0.1"]);

  const httpServer = createServer((request, response) => {
    if (!validateHostHeader(request, response)) return;
    if (!isAuthorized(request, httpConfiguration.bearerToken)) {
      rejectUnauthorized(response);
      return;
    }
    void nodeHandler(request, response);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(httpConfiguration.port, httpConfiguration.host, resolve);
  });

  process.stderr.write(
    `mcp-server-overleaf: listening on http://${httpConfiguration.host}:${httpConfiguration.port} ` +
      `(${httpConfiguration.bearerToken ? "bearer token required" : "UNAUTHENTICATED"})\n`,
  );

  const shutDown = async (): Promise<void> => {
    await handler.close();
    httpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutDown());
  process.on("SIGTERM", () => void shutDown());
}
