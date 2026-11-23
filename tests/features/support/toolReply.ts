import type { McpStdioClient } from "../../integration/mcpStdioClient.js";
import { responseText } from "../../integration/support/mcpProtocol.js";

/** What a tool answered, and whether it answered as a failure rather than a plain reply. */
export interface ToolReply {
  readonly text: string;
  readonly isError: boolean;
}

export async function callTool(
  client: McpStdioClient,
  toolName: string,
  toolArguments: Record<string, unknown> = {},
): Promise<ToolReply> {
  const response = await client.callRaw(toolName, toolArguments);
  return { text: responseText(response), isError: response.result?.isError === true };
}
