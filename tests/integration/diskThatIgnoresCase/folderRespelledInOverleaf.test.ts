import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { temporaryDiskIgnoresCase } from "../../support/temporaryDiskIgnoresCase.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * When a collaborator renames sections to Sections while the clone has a new file in it, the sync
 * cannot remove the folder, so the disk keeps the old spelling while Git has the new one. Both
 * spellings then reach the same folder, and neither may be refused.
 */
describe.runIf(temporaryDiskIgnoresCase())(
  "a folder renamed to another case in Overleaf around a new local file",
  () => {
    let remote: FakeOverleafRemote;
    let client: McpStdioClient;

    beforeEach(async () => {
      remote = await FakeOverleafRemote.create();
      await remote.collaboratorPushes("main.tex", "\\documentclass{article}\n", "Initial draft");
      await remote.collaboratorPushes("sections/intro.tex", "\\section{Intro}\n", "Intro");
      client = await McpStdioClient.start(remote.environment());
      await client.call("edit_file", { action: "write", path: "sections/draft.tex", content: "Draft.\n" });
      await remote.collaboratorRenames("sections", "Sections", "Capitalize the sections folder");
      await client.call("read_project", { view: "files" });
    });

    afterEach(async () => {
      await client.stop();
      remote.cleanUp();
    });

    it("keeps the old spelling on disk, as the premise of these tests", () => {
      const names = readdirSync(join(remote.workspaceDirectory, remote.projectId));
      expect(names).toContain("sections");
      expect(names).not.toContain("Sections");
    });

    it("reads a file under Overleaf's spelling of the folder and the new file under the disk's", async () => {
      expect(await client.call("read_file", { path: "Sections/intro.tex" })).toBe("\\section{Intro}\n");
      expect(await client.call("read_file", { path: "sections/draft.tex" })).toBe("Draft.\n");
    });

    it("publishes the new file inside Overleaf's spelling of the folder", async () => {
      await client.call("push_changes", { commitMessage: "Add the draft section" });
      expect(await remote.listPublishedFiles()).toEqual([
        "Sections/draft.tex",
        "Sections/intro.tex",
        "main.tex",
      ]);
    });
  },
);
