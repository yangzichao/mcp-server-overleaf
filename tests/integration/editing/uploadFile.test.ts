import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xde, 0xad, 0xbe, 0xef]);

describe("uploading a file into the project", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient | undefined;
  let sourceDirectory: string;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", "\\documentclass{article}\n", "Initial draft");
    sourceDirectory = mkdtempSync(join(tmpdir(), "overleaf-upload-"));
  });

  afterEach(async () => {
    await client?.stop();
    client = undefined;
    remote.cleanUp();
    rmSync(sourceDirectory, { recursive: true, force: true });
  });

  async function startClient(): Promise<McpStdioClient> {
    client = await McpStdioClient.start(remote.environment());
    return client;
  }

  it("copies a binary file from disk and publishes it byte for byte on push", async () => {
    const source = join(sourceDirectory, "plot.png");
    writeFileSync(source, PNG_BYTES);
    const mcp = await startClient();
    const answer = await mcp.call("manage_files", {
      action: "upload",
      path: "figures/plot.png",
      sourcePath: source,
    });
    expect(answer).toContain(`Added figures/plot.png (${PNG_BYTES.length} bytes) in the local clone.`);
    expect(await remote.listPublishedFiles()).not.toContain("figures/plot.png");

    await mcp.call("push_changes", { commitMessage: "Add the plot" });
    expect(await remote.readPublishedBytes("figures/plot.png")).toEqual(PNG_BYTES);
  });

  it("decodes base64 content and replaces an existing file", async () => {
    const mcp = await startClient();
    const answer = await mcp.call("manage_files", {
      action: "upload",
      path: "main.tex",
      contentBase64: Buffer.from("\\documentclass{book}\n").toString("base64"),
    });
    expect(answer).toContain("Replaced main.tex");
    expect(await mcp.call("read_file", { path: "main.tex" })).toBe("\\documentclass{book}\n");
  });

  it("refuses a hidden path, a relative path, and both sources at once", async () => {
    const hiddenDirectory = join(sourceDirectory, ".ssh");
    mkdirSync(hiddenDirectory);
    writeFileSync(join(hiddenDirectory, "id_ed25519"), "not really a key");
    const mcp = await startClient();

    const hidden = await mcp.call("manage_files", {
      action: "upload",
      path: "key.txt",
      sourcePath: join(hiddenDirectory, "id_ed25519"),
    });
    expect(hidden).toContain("Refusing to upload from a hidden path (.ssh)");
    expect(
      await mcp.call("manage_files", { action: "upload", path: "a.png", sourcePath: "plot.png" }),
    ).toContain("absolute path");
    expect(
      await mcp.call("manage_files", {
        action: "upload",
        path: "a.png",
        sourcePath: "/x.png",
        contentBase64: "AA==",
      }),
    ).toContain("exactly one of sourcePath and contentBase64");
    expect(
      await mcp.call("manage_files", { action: "upload", path: "a.png", contentBase64: "not base64!" }),
    ).toContain("not valid base64");
  });

  it("keeps the upload inside the project", async () => {
    writeFileSync(join(sourceDirectory, "plot.png"), PNG_BYTES);
    const answer = await (await startClient()).call("manage_files", {
      action: "upload",
      path: "../outside.png",
      sourcePath: join(sourceDirectory, "plot.png"),
    });
    expect(answer).toContain("resolves outside the project");
  });
});
