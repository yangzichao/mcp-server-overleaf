import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { responseText } from "../support/mcpProtocol.js";
import { temporaryDiskIgnoresCase } from "../support/temporaryDiskIgnoresCase.js";

/**
 * On a disk that ignores case, Sections/method/old is inside sections though the two paths differ
 * as strings. rename refuses the move with EINVAL and the clone's absolute paths, after the
 * missing parents of the destination were already created inside the folder being moved.
 */
describe.runIf(temporaryDiskIgnoresCase())("moving a folder into itself on a disk that ignores case", () => {
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

  it.each(["Sections/method/old", "SECTIONS/new/old"])(
    "refuses to move sections to %s, and creates nothing",
    async (toPath) => {
      const response = await client.callRaw("manage_files", { action: "move", path: "sections", toPath });
      expect(response.result?.isError).toBe(true);
      expect(responseText(response)).toBe(
        `${toPath} is inside sections, and a directory cannot be moved into itself. Nothing was moved.`,
      );
      expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
      expect(existsSync(clonePath("sections/new"))).toBe(false);
      expect(await client.call("read_file", { path: "sections/intro.tex" })).toBe("\\section{Intro}\n");
    },
  );
});
