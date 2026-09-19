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

export interface JsonRpcResponse {
  readonly id?: number;
  readonly result?: {
    readonly content?: Array<{ type: string; text?: string }>;
    readonly tools?: McpToolDescription[];
    readonly isError?: boolean;
    readonly protocolVersion?: string;
  };
  readonly error?: { code: number; message: string };
}

export function responseText(response: JsonRpcResponse): string {
  if (response.error) return `RPC ERROR: ${response.error.message}`;
  return (response.result?.content ?? []).map((block) => block.text ?? "").join("\n");
}
