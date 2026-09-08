import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { serverEntryPoint, serverWorkingDirectory } from "../support/serverUnderTest.js";
import { type JsonRpcResponse, responseText } from "./support/mcpProtocol.js";

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
  private processFailure: Error | null = null;

  private constructor(private readonly child: ChildProcessWithoutNullStreams) {}

  static async start(environment: NodeJS.ProcessEnv): Promise<McpStdioClient> {
    const child = spawn(process.execPath, [serverEntryPoint, "--stdio"], {
      // A bare environment, minus PATH: an MCP client does not pass a shell through.
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...environment },
      stdio: ["pipe", "pipe", "pipe"],
      cwd: serverWorkingDirectory,
    });

    const client = new McpStdioClient(child);
    child.once("error", (error) => {
      client.processFailure = error;
    });
    child.once("exit", (code, signal) => {
      client.processFailure = new Error(`MCP server exited (${code ?? signal}). ${client.stderrText}`);
    });
    child.stdout.on("data", (chunk: Buffer) => client.consume(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => {
      client.stderrText += chunk.toString();
    });

    try {
      await client.initialize();
      return client;
    } catch (error) {
      await client.stop();
      throw error;
    }
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
        } else if (this.processFailure) {
          clearInterval(poll);
          rejectPromise(this.processFailure);
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
    const response = await this.waitFor(id);
    if (response.error || !response.result?.protocolVersion) {
      throw new Error(`MCP initialization failed: ${JSON.stringify(response)}`);
    }
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async listToolNames(): Promise<string[]> {
    return (await this.listTools()).map((tool) => tool.name);
  }

  async listTools() {
    const id = this.nextRequestId++;
    this.send({ jsonrpc: "2.0", id, method: "tools/list", params: {} });
    const response = await this.waitFor(id);
    if (response.error) throw new Error(response.error.message);
    return response.result?.tools ?? [];
  }

  /** Calls a tool and returns its text output, or the RPC error rendered as text. */
  async call(toolName: string, toolArguments: Record<string, unknown> = {}): Promise<string> {
    return responseText(await this.callRaw(toolName, toolArguments));
  }

  async callRaw(toolName: string, toolArguments: Record<string, unknown> = {}): Promise<JsonRpcResponse> {
    const id = this.nextRequestId++;
    this.send({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: toolArguments },
    });
    return await this.waitFor(id);
  }

  get stderr(): string {
    return this.stderrText;
  }

  async stop(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise<void>((resolvePromise) => this.child.once("exit", () => resolvePromise()));
    const timeout = setTimeout(() => this.child.kill("SIGKILL"), 2000);
    this.child.kill();
    await exited;
    clearTimeout(timeout);
  }
}
