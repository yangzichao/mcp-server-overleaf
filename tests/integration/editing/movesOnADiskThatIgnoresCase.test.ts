import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { responseText } from "../support/mcpProtocol.js";
import { temporaryDiskIgnoresCase } from "../support/temporaryDiskIgnoresCase.js";

/**
 * On a disk that ignores case, as macOS does by default, two paths that differ only in case name
 * one entry. Sections/method/old is inside sections, and Main.tex is main.tex itself.
 */
describe.runIf(temporaryDiskIgnoresCase())("manage_files move on a disk that ignores case", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", "\\documentclass{article}\n", "Initial draft");
    await remote.collaboratorPushes("sections/intro.tex", "\\section{Intro}\n", "Intro");
    await remote.collaboratorPushes("sections/method/setup.tex", "\\section{Setup}\n", "Setup");
    client = await McpStdioClient.start(remote.environment());
  });

  afterEach(async () => {
    await client.stop();
    remote.cleanUp();
  });

  const clonePath = (path: string) => join(remote.workspaceDirectory, remote.projectId, path);

  async function refusal(toolArguments: Record<string, unknown>): Promise<string> {
    const response = await client.callRaw("manage_files", toolArguments);
    expect(response.result?.isError).toBe(true);
    return responseText(response);
  }

  // rename used to fail with EINVAL and the clone's absolute paths, after the missing parents of
  // the destination were already created inside the folder being moved.
  it.each(["Sections/method/old", "SECTIONS/new/old"])(
    "refuses to move sections to %s, and creates nothing",
    async (toPath) => {
      expect(await refusal({ action: "move", path: "sections", toPath })).toBe(
        `${toPath} is inside sections, and a directory cannot be moved into itself. Nothing was moved.`,
      );
      expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
      expect(existsSync(clonePath("sections/new"))).toBe(false);
      expect(await client.call("read_file", { path: "sections/intro.tex" })).toBe("\\section{Intro}\n");
    },
  );

  // The refusal used to call Main.tex a file that already exists and advise deleting it first,
  // which would delete main.tex.
  it.each([
    ["main.tex", "Main.tex", "file"],
    ["sections", "Sections", "folder"],
  ])(
    "refuses to rename %s to %s, which differ only in case, and keeps the old name",
    async (path, toPath, noun) => {
      expect(await refusal({ action: "move", path, toPath })).toBe(
        `${path} and ${toPath} are the same ${noun} on this computer's disk, which does not tell the two names apart, ` +
          "so the clone cannot rename one to the other. Nothing was moved. " +
          "Rename it in Overleaf's editor; the clone picks up the new name at its next sync.",
      );
      expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
      expect(readdirSync(clonePath("."))).toContain(path);
      expect(readdirSync(clonePath("."))).not.toContain(toPath);
    },
  );
});
