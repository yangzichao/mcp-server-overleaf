import { PACKAGE_NAME, PACKAGE_VERSION } from "../../config/packageMetadata.js";

/**
 * One request to a public metadata service. Crossref asks clients to identify themselves;
 * this names the software and where it lives, and nothing about the person running it.
 */

const USER_AGENT = `${PACKAGE_NAME}/${PACKAGE_VERSION} (+https://github.com/yangzichao/mcp-server-overleaf)`;
const REQUEST_TIMEOUT_MS = 20_000;

export interface MetadataResponse {
  readonly status: number;
  readonly body: string;
}

export async function fetchMetadata(url: string, accept: string): Promise<MetadataResponse> {
  const response = await fetch(url, {
    headers: { accept, "user-agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return { status: response.status, body: await response.text() };
}

export function describeFailure(service: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `${service} could not be reached (${reason})`;
}
