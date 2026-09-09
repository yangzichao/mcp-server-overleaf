import { ConfigurationError } from "./serverConfiguration.js";

export interface HttpTransportConfiguration {
  readonly host: string;
  readonly port: number;
  /** When null the endpoint is unauthenticated, which is only allowed with an explicit opt-in. */
  readonly bearerToken: string | null;
}

export interface HttpTransportOverrides {
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly allowAnonymous?: boolean;
}

export function loadHttpTransportConfiguration(
  overrides: HttpTransportOverrides = {},
  environment: NodeJS.ProcessEnv = process.env,
): HttpTransportConfiguration {
  const bearerToken = environment.OVERLEAF_MCP_HTTP_AUTH_TOKEN?.trim() || null;

  if (!bearerToken && !overrides.allowAnonymous) {
    throw new ConfigurationError(
      "HTTP transport refuses to start without OVERLEAF_MCP_HTTP_AUTH_TOKEN. Anyone who can reach the port would " +
        "otherwise be able to read and rewrite your Overleaf projects. Set the variable, or pass --allow-anonymous " +
        "if the port is genuinely unreachable from outside this machine.",
    );
  }

  const portFromEnvironment = environment.OVERLEAF_MCP_HTTP_PORT?.trim();
  const port = overrides.port ?? (portFromEnvironment ? Number.parseInt(portFromEnvironment, 10) : 3017);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new ConfigurationError(`Invalid HTTP port: ${port}`);
  }

  return {
    // Every step of this fallback rejects a blank value rather than passing it on.
    // Node reads an empty host as "unspecified" and binds every interface, so a
    // `--host ""` or an exported-but-empty OVERLEAF_MCP_HTTP_HOST would otherwise turn a
    // loopback-only default into a port the whole network can reach.
    host: overrides.host?.trim() || environment.OVERLEAF_MCP_HTTP_HOST?.trim() || "127.0.0.1",
    port,
    bearerToken,
  };
}
