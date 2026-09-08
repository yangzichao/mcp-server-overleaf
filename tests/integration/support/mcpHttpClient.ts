import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createServer } from "node:net";
import { serverEntryPoint, serverWorkingDirectory } from "../../support/serverUnderTest.js";
import { type JsonRpcResponse, responseText } from "./mcpProtocol.js";

export const httpTestToken = "test-bearer-token-not-a-real-secret";

async function findAvailablePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    listener.once("error", rejectPromise);
    listener.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No TCP port was assigned");
  await new Promise<void>((resolvePromise, rejectPromise) =>
    listener.close((error) => (error ? rejectPromise(error) : resolvePromise())),
  );
  return address.port;
}

export class McpHttpClient {
  private nextRequestId = 1;
  private constructor(
    readonly url: string,
    private readonly child: ChildProcessWithoutNullStreams,
  ) {}

  static async start(environment: NodeJS.ProcessEnv): Promise<McpHttpClient> {
    const port = await findAvailablePort();
    const child = spawn(process.execPath, [serverEntryPoint, "--http", "--port", String(port)], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...environment,
        OVERLEAF_MCP_HTTP_AUTH_TOKEN: httpTestToken,
      },
      stdio: ["pipe", "pipe", "pipe"],
      cwd: serverWorkingDirectory,
    });
    const client = new McpHttpClient(`http://127.0.0.1:${port}/`, child);
    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        let stderr = "";
        const timeout = setTimeout(
          () => rejectPromise(new Error(`HTTP server startup timed out: ${stderr}`)),
          10_000,
        );
        child.once("error", (error) => {
          clearTimeout(timeout);
          rejectPromise(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timeout);
          rejectPromise(new Error(`HTTP server exited (${code}): ${stderr}`));
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
          if (stderr.includes("listening on http")) {
            clearTimeout(timeout);
            resolvePromise();
          }
        });
      });
      const initialized = await client.request("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "http-integration-test", version: "1" },
      });
      if (initialized.error || !initialized.result?.protocolVersion)
        throw new Error("HTTP initialization failed");
      const notification = await client.post({ jsonrpc: "2.0", method: "notifications/initialized" });
      await notification.text();
      if (!notification.ok) throw new Error(`Initialization notification failed: ${notification.status}`);
      return client;
    } catch (error) {
      await client.stop();
      throw error;
    }
  }

  post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${httpTestToken}`,
        "mcp-protocol-version": "2025-11-25",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  }

  private async request(method: string, params: unknown): Promise<JsonRpcResponse> {
    const id = this.nextRequestId++;
    const response = await this.post({ jsonrpc: "2.0", id, method, params });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
    const messages: JsonRpcResponse[] = response.headers.get("content-type")?.includes("text/event-stream")
      ? body
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => JSON.parse(line.slice(5)))
      : [JSON.parse(body)];
    const message = messages.find((entry) => entry.id === id);
    if (!message) throw new Error(`No response for MCP request ${id}: ${body}`);
    return message;
  }

  async listTools() {
    const response = await this.request("tools/list", {});
    if (response.error) throw new Error(response.error.message);
    return response.result?.tools ?? [];
  }

  callRaw(name: string, argumentsValue: Record<string, unknown> = {}): Promise<JsonRpcResponse> {
    return this.request("tools/call", { name, arguments: argumentsValue });
  }

  async call(name: string, argumentsValue: Record<string, unknown> = {}): Promise<string> {
    return responseText(await this.callRaw(name, argumentsValue));
  }

  async stop(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exit = new Promise<void>((resolvePromise) => this.child.once("exit", () => resolvePromise()));
    const timeout = setTimeout(() => this.child.kill("SIGKILL"), 2000);
    this.child.kill();
    await exit;
    clearTimeout(timeout);
  }
}
