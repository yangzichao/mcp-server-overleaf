import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface JsonRpcResponse {
  readonly id?: number;
  readonly result?: { content?: Array<{ text?: string }>; tools?: Array<{ name: string }> };
  readonly error?: { message?: string };
}

/**
 * Speaks MCP to the compiled server over stdio, the way a real client does. Tests drive
 * the published protocol rather than calling handlers directly, so a change that breaks
 * the wire format is caught here.
 */
export class McpStdioClient {
  private nextRequestId = 1;
  private readonly received: JsonRpcResponse[] = [];
  private buffer = "";
  private stderrText = "";

  private constructor(private readonly child: ChildProcessWithoutNullStreams) {}

  static async start(environment: NodeJS.ProcessEnv): Promise<McpStdioClient> {
    const child = spawn("node", [resolve(packageRoot, "dist", "index.js"), "--stdio"], {
      // A bare environment, minus PATH: an MCP client does not pass a shell through.
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...environment },
      stdio: ["pipe", "pipe", "pipe"],
      cwd: packageRoot,
    });

    const client = new McpStdioClient(child);
    child.stdout.on("data", (chunk: Buffer) => client.consume(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => {
      client.stderrText += chunk.toString();
    });

    await client.initialize();
    return client;
  }

  private consume(text: string): void {
    this.buffer += text;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line !== "") this.received.push(JSON.parse(line) as JsonRpcResponse);
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private send(message: unknown): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private waitFor(id: number, timeoutMs = 60_000): Promise<JsonRpcResponse> {
    return new Promise((resolvePromise, rejectPromise) => {
      const deadline = Date.now() + timeoutMs;
      const poll = setInterval(() => {
        const found = this.received.find((message) => message.id === id);
        if (found) {
          clearInterval(poll);
          resolvePromise(found);
        } else if (Date.now() > deadline) {
          clearInterval(poll);
          rejectPromise(new Error(`timed out waiting for response ${id}. stderr:\n${this.stderrText}`));
        }
      }, 20);
    });
  }

  private async initialize(): Promise<void> {
    const id = this.nextRequestId++;
    this.send({
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "integration-test", version: "1" },
      },
    });
    await this.waitFor(id);
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async listToolNames(): Promise<string[]> {
    const id = this.nextRequestId++;
    this.send({ jsonrpc: "2.0", id, method: "tools/list", params: {} });
    const response = await this.waitFor(id);
    return (response.result?.tools ?? []).map((tool) => tool.name);
  }

  /** Calls a tool and returns its text output, or the RPC error rendered as text. */
  async call(toolName: string, toolArguments: Record<string, unknown> = {}): Promise<string> {
    const id = this.nextRequestId++;
    this.send({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: toolArguments },
    });
    const response = await this.waitFor(id);
    if (response.error) return `RPC ERROR: ${response.error.message ?? "unknown"}`;
    return (response.result?.content ?? []).map((block) => block.text ?? "").join("\n");
  }

  get stderr(): string {
    return this.stderrText;
  }

  stop(): void {
    this.child.kill();
  }
}
