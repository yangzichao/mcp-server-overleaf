#!/usr/bin/env node
import { loadHttpTransportConfiguration } from "./config/httpTransportConfiguration.js";
import { loadEnvironmentFileIfPresent } from "./config/loadEnvironmentFile.js";
import { ConfigurationError, loadServerConfigurationFromEnvironment } from "./config/serverConfiguration.js";
import { createToolContext } from "./server/createOverleafMcpServer.js";
import { serveOverStdio } from "./transport/serveOverStdio.js";
import { serveOverStreamableHttp } from "./transport/serveOverStreamableHttp.js";

interface CommandLineOptions {
  readonly transport: "stdio" | "http";
  readonly port: number | undefined;
  readonly host: string | undefined;
  readonly allowAnonymous: boolean;
}

const USAGE = `mcp-server-overleaf - read and safely edit Overleaf projects over the Overleaf git bridge

  mcp-server-overleaf --stdio                 serve on stdio (ChatGPT desktop, Codex, Claude Desktop, Cursor)
  mcp-server-overleaf --http [--port 3017]    serve Streamable HTTP (remote MCP clients)

Environment:
  OVERLEAF_GIT_TOKEN        required, from https://www.overleaf.com/user/settings
  OVERLEAF_PROJECTS         name=projectId pairs, e.g. paper=64a1b2c3d4e5f6a7b8c9d0e1,thesis=...
  OVERLEAF_DEFAULT_PROJECT  which registered name to use when a tool omits 'project'
  OVERLEAF_MCP_WORKSPACE_DIR   where clones live (default ~/.overleaf-mcp/projects)
  OVERLEAF_MCP_HTTP_AUTH_TOKEN bearer token required by --http unless --allow-anonymous

These are read from the process environment, falling back to a .env file next to this
install. Values already set by the client always win.
`;

function parseCommandLine(argv: readonly string[]): CommandLineOptions {
  let transport: "stdio" | "http" = "stdio";
  let port: number | undefined;
  let host: string | undefined;
  let allowAnonymous = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--stdio":
        transport = "stdio";
        break;
      case "--http":
        transport = "http";
        break;
      case "--allow-anonymous":
        allowAnonymous = true;
        break;
      case "--port":
        port = Number.parseInt(argv[index + 1] ?? "", 10);
        index += 1;
        break;
      case "--host":
        host = argv[index + 1];
        index += 1;
        break;
      case "--help":
      case "-h":
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument "${argument}".\n\n${USAGE}`);
    }
  }

  return { transport, port, host, allowAnonymous };
}

async function main(): Promise<void> {
  const options = parseCommandLine(process.argv.slice(2));

  // A client spawns us without a shell, so pick up `.env` next to the install before
  // reading configuration. Anything the client set explicitly still wins.
  loadEnvironmentFileIfPresent();

  const configuration = loadServerConfigurationFromEnvironment();
  const context = createToolContext(configuration);

  if (options.transport === "stdio") {
    await serveOverStdio(context);
    return;
  }

  await serveOverStreamableHttp(
    context,
    loadHttpTransportConfiguration({
      port: options.port,
      host: options.host,
      allowAnonymous: options.allowAnonymous,
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${error instanceof ConfigurationError ? "configuration error" : "fatal"}: ${message}\n`,
  );
  process.exit(1);
});
