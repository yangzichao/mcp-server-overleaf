import { spawn } from "node:child_process";
import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadHttpTransportConfiguration } from "../../src/config/httpTransportConfiguration.js";
import { ConfigurationError } from "../../src/config/serverConfiguration.js";
import { serverEntryPoint, serverWorkingDirectory } from "../support/serverUnderTest.js";
import { FakeOverleafRemote } from "./fakeOverleafRemote.js";
import { httpTestToken, McpHttpClient } from "./support/mcpHttpClient.js";

const bearerToken = httpTestToken;

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

  // Node reads an empty host as "unspecified" and binds every interface, so a variable
  // that is exported but empty, or a `--host ""`, would silently turn the loopback
  // default into a port the whole network can reach.
  it("treats a blank host as no host at all rather than as every interface", () => {
    for (const blank of ["", "   "]) {
      expect(
        loadHttpTransportConfiguration(
          {},
          { OVERLEAF_MCP_HTTP_AUTH_TOKEN: "abc", OVERLEAF_MCP_HTTP_HOST: blank },
        ).host,
      ).toBe("127.0.0.1");
      expect(
        loadHttpTransportConfiguration({ host: blank }, { OVERLEAF_MCP_HTTP_AUTH_TOKEN: "abc" }).host,
      ).toBe("127.0.0.1");
    }
  });

  it("still honours a host that was actually given", () => {
    expect(
      loadHttpTransportConfiguration(
        {},
        { OVERLEAF_MCP_HTTP_AUTH_TOKEN: "abc", OVERLEAF_MCP_HTTP_HOST: "0.0.0.0" },
      ).host,
    ).toBe("0.0.0.0");
    expect(
      loadHttpTransportConfiguration({ host: "::1" }, { OVERLEAF_MCP_HTTP_AUTH_TOKEN: "abc" }).host,
    ).toBe("::1");
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
  let client: McpHttpClient;

  const initializeRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } },
  };
  const post = (headers: Record<string, string>) =>
    client.post(initializeRequest, { authorization: "", ...headers });

  beforeAll(async () => {
    remote = await FakeOverleafRemote.create("74a1b2c3d4e5f6a7b8c9d0e1");
    await remote.collaboratorPushes("main.tex", "Original draft", "Initial draft");
    client = await McpHttpClient.start(remote.environment());
  });

  afterAll(async () => {
    await client?.stop();
    remote?.cleanUp();
  });

  it("rejects unauthenticated tool writes before they reach the project", async () => {
    const response = await client.post(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "write_file",
          arguments: { path: "main.tex", content: "Unauthorized edit" },
        },
      },
      { authorization: "" },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    await response.text();
    expect(await remote.readPublishedFile("main.tex")).toBe("Original draft");
    expect(await client.call("show_diff")).toBe("No local changes pending.");
  });

  it("rejects an unexpected Host even with a valid token", async () => {
    // fetch normalizes Host on some Node versions; use an actual HTTP request to
    // guarantee that the attacker-controlled header reaches the server unchanged.
    const status = await new Promise<number | undefined>((resolvePromise, rejectPromise) => {
      const attempt = request(
        client.url,
        {
          method: "POST",
          headers: {
            host: "attacker.invalid",
            authorization: `Bearer ${bearerToken}`,
            "content-type": "application/json",
          },
        },
        (response) => {
          response.resume();
          response.once("end", () => resolvePromise(response.statusCode));
        },
      );
      attempt.once("error", rejectPromise);
      attempt.setTimeout(5000, () => attempt.destroy(new Error("HTTP Host check timed out")));
      attempt.end(JSON.stringify(initializeRequest));
    });
    expect(status).toBe(403);
  });

  it("rejects the wrong content type and remains usable", async () => {
    const response = await client.post(initializeRequest, { "content-type": "text/plain" });
    expect(response.status).toBe(415);
    await response.text();
    expect(await client.call("list_projects")).toContain("paper");
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
    const attempt = spawn(process.execPath, [serverEntryPoint, "--http", "--port", "3198"], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...remote.environment() },
      stdio: ["pipe", "pipe", "pipe"],
      cwd: serverWorkingDirectory,
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
