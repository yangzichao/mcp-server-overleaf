/** A tool as `tools/list` advertises it, narrowed to the parts these tests assert on. */
export interface McpToolDescription {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema: {
    readonly type: string;
    readonly required?: string[];
    readonly properties?: Record<string, unknown>;
  };
  readonly outputSchema?: { readonly type: string };
  readonly annotations?: Record<string, boolean | string>;
}

/** A prompt as `prompts/list` advertises it. */
export interface McpPromptDescription {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

/** A text block, or an image block with its base64 `data` and `mimeType`. */
export interface McpContentBlock {
  readonly type: string;
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
}

export interface JsonRpcResponse {
  readonly id?: number;
  readonly result?: {
    readonly content?: McpContentBlock[];
    readonly structuredContent?: Record<string, unknown>;
    readonly tools?: McpToolDescription[];
    readonly prompts?: McpPromptDescription[];
    readonly messages?: Array<{ role: string; content: McpContentBlock }>;
    readonly isError?: boolean;
    readonly protocolVersion?: string;
    readonly instructions?: string;
  };
  readonly error?: { code: number; message: string };
}

export function responseText(response: JsonRpcResponse): string {
  if (response.error) return `RPC ERROR: ${response.error.message}`;
  return (response.result?.content ?? []).map((block) => block.text ?? "").join("\n");
}
