export interface McpToolDescription {
  readonly name: string;
  readonly inputSchema: {
    readonly type: string;
    readonly required?: string[];
    readonly properties?: Record<string, unknown>;
  };
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
