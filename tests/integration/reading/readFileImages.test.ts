import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAXIMUM_IMAGE_BYTES } from "../../../src/images/prepareImageForModel.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { paddedPng, SMALL_PNG } from "../support/testImages.js";

/**
 * read_file on figures in the clone: an image comes back as an image block the model can see,
 * and every other binary file as a refusal that says what to do instead.
 */

const PAPER = "\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n";

let remote: FakeOverleafRemote;
let client: McpStdioClient | undefined;
const clonePath = (path: string) => join(remote.workspaceDirectory, remote.projectId, path);

beforeEach(async () => {
  remote = await FakeOverleafRemote.create();
  await remote.collaboratorPushes("main.tex", PAPER, "Initial draft");
  await remote.collaboratorPushes("figures/plot.png", SMALL_PNG, "Add a plot");
});

afterEach(async () => {
  await client?.stop();
  client = undefined;
  remote.cleanUp();
});

async function refusalFor(toolArguments: Record<string, unknown>): Promise<string> {
  const response = await client?.callRaw("read_file", toolArguments);
  expect(response?.result?.isError, JSON.stringify(toolArguments)).toBe(true);
  return response?.result?.content?.[0]?.text ?? "";
}

describe("read_file on an image in the clone", () => {
  it("returns a PNG as an image block, after a line naming it", async () => {
    client = await McpStdioClient.start(remote.environment());
    const response = await client.callRaw("read_file", { path: "figures/plot.png" });
    expect(response.result?.isError).toBeFalsy();
    expect(response.result?.content).toEqual([
      { type: "text", text: `figures/plot.png: PNG image, 3 by 2 pixels, ${SMALL_PNG.length} bytes.` },
      { type: "image", data: SMALL_PNG.toString("base64"), mimeType: "image/png" },
    ]);
  });

  it("reads a figure a text-only checkout keeps off disk, and leaves the checkout text-only", async () => {
    client = await McpStdioClient.start({ ...remote.environment(), OVERLEAF_MCP_CHECKOUT_MODE: "text-only" });
    const response = await client.callRaw("read_file", { path: "figures/plot.png" });
    expect(response.result?.content?.[1]).toEqual({
      type: "image",
      data: SMALL_PNG.toString("base64"),
      mimeType: "image/png",
    });
    expect(existsSync(clonePath("figures/plot.png"))).toBe(false);
    expect(existsSync(clonePath("main.tex"))).toBe(true);
  });

  it("says a figure deleted in the clone is gone, instead of showing its committed copy", async () => {
    client = await McpStdioClient.start(remote.environment());
    await client.call("manage_files", { action: "delete", path: "figures/plot.png" });
    expect(await refusalFor({ path: "figures/plot.png" })).toBe(
      "figures/plot.png is deleted in the clone, and the deletion is not pushed yet.",
    );
    expect(await refusalFor({ path: "figures/none.png" })).toBe("No file figures/none.png in the project.");
  });

  it("refuses an image too large to send, and one too damaged to read", async () => {
    await remote.collaboratorPushes("figures/huge.png", paddedPng(MAXIMUM_IMAGE_BYTES + 1), "A huge figure");
    await remote.collaboratorPushes("figures/cut.png", SMALL_PNG.subarray(0, 12), "A cut-off figure");
    client = await McpStdioClient.start(remote.environment());
    expect(await refusalFor({ path: "figures/huge.png" })).toContain(
      `figures/huge.png is ${MAXIMUM_IMAGE_BYTES + 1} bytes, more than the ${MAXIMUM_IMAGE_BYTES} an image sent to the model may have.`,
    );
    expect(await refusalFor({ path: "figures/cut.png" })).toContain("looks damaged or cut short");
  });

  it("refuses a PDF figure with the command that renders it, and any other binary file plainly", async () => {
    await remote.collaboratorPushes("figures/diagram.pdf", Buffer.from("%PDF-1.5\n\0\x01stream"), "A PDF");
    await remote.collaboratorPushes("data/table.bin", Buffer.from([0, 1, 2, 3]), "Binary data");
    client = await McpStdioClient.start(remote.environment());
    const pdf = await refusalFor({ path: "figures/diagram.pdf" });
    expect(pdf).toContain("figures/diagram.pdf is a PDF, which is not sent as an image.");
    expect(pdf).toContain("pdftoppm -png");
    expect(await refusalFor({ path: "data/table.bin" })).toBe(
      "data/table.bin is a binary file, neither text nor an image the model can see (PNG, JPEG, GIF or WebP), so there is nothing to return.",
    );
  });

  it("refuses the arguments that shape a text read, before reading anything", async () => {
    client = await McpStdioClient.start(remote.environment());
    expect(await refusalFor({ path: "figures/plot.png", startLine: 1, endLine: 2 })).toBe(
      "figures/plot.png is an image, which read_file returns whole as it is now; startLine, endLine apply to text files only.",
    );
    expect(await refusalFor({ path: "figures/plot.png", mode: "full" })).toBe(
      "figures/plot.png is an image, which read_file returns whole as it is now; mode applies to text files only.",
    );
    expect(await refusalFor({ path: "figures/plot.png", revision: "abc1234" })).toBe(
      "figures/plot.png is an image, which read_file returns whole as it is now; revision applies to text files only.",
    );
  });
});
