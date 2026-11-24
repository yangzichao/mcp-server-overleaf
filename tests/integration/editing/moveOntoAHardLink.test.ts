import { existsSync, linkSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { responseText } from "../support/mcpProtocol.js";

const MAIN_TEX = "\\documentclass{article}\n";
const INTRO_TEX = "\\section{Intro}\n";

describe("manage_files move onto another hard link of the same file", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", MAIN_TEX, "Initial draft");
    await remote.collaboratorPushes("sections/intro.tex", INTRO_TEX, "Intro");
    client = await McpStdioClient.start(remote.environment());
    await client.call("read_file", { path: "main.tex" });
  });

  afterEach(async () => {
    await client.stop();
    remote.cleanUp();
  });

  const inClone = (path: string) => join(remote.workspaceDirectory, remote.projectId, path);

  it.each([
    ["in the same folder", "main.tex", "copy.tex", MAIN_TEX],
    ["in another folder", "sections/intro.tex", "appendix/intro.tex", INTRO_TEX],
  ])("refuses a hard link %s as a destination that already exists", async (_where, path, toPath, content) => {
    mkdirSync(dirname(inClone(toPath)), { recursive: true });
    linkSync(inClone(path), inClone(toPath));

    const response = await client.callRaw("manage_files", { action: "move", path, toPath });
    expect(response.result?.isError).toBe(true);
    expect(responseText(response)).toBe(
      `${toPath} already exists. Nothing was moved. Delete it first, or choose another destination.`,
    );
    expect(existsSync(inClone(path))).toBe(true);
    expect(readFileSync(inClone(toPath), "utf8")).toBe(content);
    expect(await client.call("read_file", { path })).toBe(content);
  });
});
