import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadHttpTransportConfiguration } from "../../src/config/httpTransportConfiguration.js";
import { ConfigurationError } from "../../src/config/serverConfiguration.js";
import { FakeOverleafRemote } from "./fakeOverleafRemote.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bearerToken = "test-bearer-token-not-a-real-secret";
const port = 3199;

describe("loadHttpTransportConfiguration", () => {
  it("refuses to start unauthenticated by default", () => {
    expect(() => loadHttpTransportConfiguration({}, {})).toThrow(ConfigurationError);
  });

  it("allows it only with an explicit opt-in", () => {
    expect(loadHttpTransportConfiguration({ allowAnonymous: true }, {}).bearerToken).toBeNull();
  });

  it("takes the token from the environment", () => {
    const configuration = loadHttpTransportConfiguration({}, { OVERLEAF_MCP_HTTP_AUTH_TOKEN: "abc123" });
    expect(configuration.bearerToken).toBe("abc123");
  });

  it("binds to loopback unless told otherwise", () => {
    expect(loadHttpTransportConfiguration({}, { OVERLEAF_MCP_HTTP_AUTH_TOKEN: "abc" }).host).toBe(
      "127.0.0.1",
    );
  });

  it("prefers a command-line port over the environment", () => {
    const configuration = loadHttpTransportConfiguration(
      { port: 4000 },
      { OVERLEAF_MCP_HTTP_AUTH_TOKEN: "abc", OVERLEAF_MCP_HTTP_PORT: "5000" },
    );
    expect(configuration.port).toBe(4000);
  });

  it("rejects a port outside the valid range", () => {
    expect(() =>
      loadHttpTransportConfiguration({ port: 70_000 }, { OVERLEAF_MCP_HTTP_AUTH_TOKEN: "abc" }),
    ).toThrow(/Invalid HTTP port/);
  });
});

describe("the HTTP endpoint", () => {
  let remote: FakeOverleafRemote;
  let serverProcess: ChildProcessWithoutNullStreams;

  const post = (headers: Record<string, string>) =>
    fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } },
      }),
    });

  beforeAll(async () => {
    remote = await FakeOverleafRemote.create("74a1b2c3d4e5f6a7b8c9d0e1");
    serverProcess = spawn(
      "node",
      [resolve(packageRoot, "dist", "index.js"), "--http", "--port", String(port)],
      {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ...remote.environment(),
          OVERLEAF_MCP_HTTP_AUTH_TOKEN: bearerToken,
        },
        stdio: ["pipe", "pipe", "pipe"],
        cwd: packageRoot,
      },
    );
    await new Promise<void>((resolvePromise) => {
      serverProcess.stderr.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("listening on http")) resolvePromise();
      });
    });
  });

  afterAll(() => {
    serverProcess.kill();
    remote.cleanUp();
  });

  it("rejects a request with no credentials", async () => {
    expect((await post({})).status).toBe(401);
  });

  it("rejects the wrong token", async () => {
    expect((await post({ authorization: "Bearer wrong-token" })).status).toBe(401);
  });

  it("rejects a token of the right length but wrong content", async () => {
    const sameLengthWrongToken = "x".repeat(bearerToken.length);
    expect((await post({ authorization: `Bearer ${sameLengthWrongToken}` })).status).toBe(401);
  });

  it("rejects a non-Bearer scheme", async () => {
    expect((await post({ authorization: `Basic ${bearerToken}` })).status).toBe(401);
  });

  it("accepts the configured token", async () => {
    expect((await post({ authorization: `Bearer ${bearerToken}` })).status).toBe(200);
  });
});

describe("refusing to start", () => {
  it("exits rather than serving the projects unauthenticated", async () => {
    const remote = await FakeOverleafRemote.create("84a1b2c3d4e5f6a7b8c9d0e1");
    const attempt = spawn("node", [resolve(packageRoot, "dist", "index.js"), "--http", "--port", "3198"], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...remote.environment() },
      stdio: ["pipe", "pipe", "pipe"],
      cwd: packageRoot,
    });

    const [exitCode, stderr] = await new Promise<[number | null, string]>((resolvePromise) => {
      let text = "";
      attempt.stderr.on("data", (chunk: Buffer) => {
        text += chunk.toString();
      });
      attempt.on("exit", (code) => resolvePromise([code, text]));
    });

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("OVERLEAF_MCP_HTTP_AUTH_TOKEN");
    remote.cleanUp();
  });
});
