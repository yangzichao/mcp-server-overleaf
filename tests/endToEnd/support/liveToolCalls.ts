import { setTimeout as sleep } from "node:timers/promises";

import type { McpStdioClient } from "../../integration/mcpStdioClient.js";
import { type JsonRpcResponse, responseText } from "../../integration/support/mcpProtocol.js";

// Overleaf's Git bridge answers "Rate-limit exceeded" after a few dozen fetches in a minute,
// and every Git tool fetches first, so a live run has to wait it out rather than fail.
const RATE_LIMIT_WAITS_MILLISECONDS = [20_000, 40_000, 60_000, 90_000];

async function callWaitingOutRateLimits(
  client: McpStdioClient,
  toolName: string,
  toolArguments: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  for (const waitMilliseconds of RATE_LIMIT_WAITS_MILLISECONDS) {
    const response = await client.callRaw(toolName, toolArguments);
    if (!responseText(response).includes("Rate-limit exceeded")) return response;
    await sleep(waitMilliseconds);
  }
  return await client.callRaw(toolName, toolArguments);
}

export async function callSucceeding(
  client: McpStdioClient,
  toolName: string,
  toolArguments: Record<string, unknown> = {},
): Promise<string> {
  const response = await callWaitingOutRateLimits(client, toolName, toolArguments);
  const text = responseText(response);
  if (response.error || response.result?.isError) {
    throw new Error(`${toolName} failed: ${text}\n\nServer stderr:\n${client.stderr}`);
  }
  return text;
}

export async function callFailing(
  client: McpStdioClient,
  toolName: string,
  toolArguments: Record<string, unknown> = {},
): Promise<string> {
  const response = await callWaitingOutRateLimits(client, toolName, toolArguments);
  const text = responseText(response);
  if (!response.error && !response.result?.isError) {
    throw new Error(`${toolName} was expected to fail but answered: ${text}`);
  }
  return text;
}

export function pushedCommitHash(pushReply: string): string {
  const match = /Pushed to Overleaf as ([0-9a-f]{7,40})/.exec(pushReply);
  if (!match?.[1]) throw new Error(`push_changes did not report a commit: ${pushReply}`);
  return match[1];
}

export function listedFilePaths(filesViewReply: string): string[] {
  return filesViewReply
    .split("\n")
    .filter((line) => line.startsWith("  "))
    .map((line) => line.trim().replace(/ \(untracked\)$/, ""));
}
