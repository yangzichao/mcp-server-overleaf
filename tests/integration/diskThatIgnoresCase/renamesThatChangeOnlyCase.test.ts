import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { temporaryDiskIgnoresCase } from "../../support/temporaryDiskIgnoresCase.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { responseText } from "../support/mcpProtocol.js";

const MAIN_TEX = "\\documentclass{article}\n";

/**
 * On a disk that ignores case, as macOS does by default, Main.tex is main.tex itself, and a clone
 * there has core.ignorecase set, so Git sees nothing after the disk alone renames main.tex.
 */
describe.runIf(temporaryDiskIgnoresCase())("manage_files move to a name that differs only in case", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", MAIN_TEX, "Initial draft");
    await remote.collaboratorPushes("sections/intro.tex", "\\section{Intro}\n", "Intro");
    await remote.collaboratorPushes("sections/method/setup.tex", "\\section{Setup}\n", "Setup");
    client = await McpStdioClient.start(remote.environment());
  });

  afterEach(async () => {
    await client.stop();
    remote.cleanUp();
  });

  const namesInCloneRoot = () =>
    readdirSync(join(remote.workspaceDirectory, remote.projectId))
      .filter((name) => name !== ".git")
      .sort();

  async function refusal(toolArguments: Record<string, unknown>): Promise<string> {
    const response = await client.callRaw("manage_files", toolArguments);
    expect(response.result?.isError).toBe(true);
    return responseText(response);
  }

  // The move used to be refused with advice to delete Main.tex first, which deletes main.tex.
  it("renames main.tex to Main.tex, and push_changes publishes the new name", async () => {
    expect(await client.call("manage_files", { action: "move", path: "main.tex", toPath: "Main.tex" })).toBe(
      "Moved main.tex to Main.tex in the local clone. " +
        "Any \\input, \\include or \\includegraphics still naming main.tex now points at nothing; " +
        "search_project for it before calling push_changes.",
    );
    expect(namesInCloneRoot()).toEqual(["Main.tex", "sections"]);
    expect(await client.call("read_file", { path: "Main.tex" })).toBe(MAIN_TEX);
    expect(await client.call("read_project", { view: "changes" })).toContain(
      "rename from main.tex\nrename to Main.tex",
    );

    await client.call("push_changes", { commitMessage: "Capitalize the main file" });
    expect(await remote.listPublishedFiles()).toEqual([
      "Main.tex",
      "sections/intro.tex",
      "sections/method/setup.tex",
    ]);
    expect(await remote.readPublishedFile("Main.tex")).toBe(MAIN_TEX);
  });

  it("renames the folder sections to Sections with every file in it, a new one included", async () => {
    await client.call("edit_file", { action: "write", path: "sections/draft.tex", content: "Draft.\n" });
    expect(await client.call("manage_files", { action: "move", path: "sections", toPath: "Sections" })).toBe(
      "Moved the directory sections to Sections, with the 3 files in it " +
        "(Sections/draft.tex, Sections/intro.tex, Sections/method/setup.tex), in the local clone. " +
        "Any \\input, \\include or \\includegraphics still naming a path under sections/ now points at nothing; " +
        "search_project for it before calling push_changes.",
    );
    expect(namesInCloneRoot()).toEqual(["Sections", "main.tex"]);

    await client.call("push_changes", { commitMessage: "Capitalize the sections folder" });
    expect(await remote.listPublishedFiles()).toEqual([
      "Sections/draft.tex",
      "Sections/intro.tex",
      "Sections/method/setup.tex",
      "main.tex",
    ]);
  });

  it("puts the old names back when the renames are discarded", async () => {
    await client.call("manage_files", { action: "move", path: "main.tex", toPath: "Main.tex" });
    await client.call("manage_files", { action: "move", path: "sections", toPath: "Sections" });
    await client.call("manage_files", { action: "discard_local_changes" });

    expect(namesInCloneRoot()).toEqual(["main.tex", "sections"]);
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
    expect(await client.call("read_file", { path: "sections/intro.tex" })).toBe("\\section{Intro}\n");
  });

  it("calls a destination that differs from the source only in Unicode normalization the same file", async () => {
    await client.call("edit_file", { action: "write", path: "caf\u00e9.tex", content: "Caf\u00e9.\n" });
    expect(
      await client.call("manage_files", { action: "move", path: "caf\u00e9.tex", toPath: "cafe\u0301.tex" }),
    ).toBe("path and toPath are the same file (caf\u00e9.tex). Nothing was moved.");
  });

  // rename used to fail with EINVAL and the clone's absolute paths, after the missing parents of
  // the destination were already created inside the folder being moved.
  it.each([
    ["Sections/method/old", "Sections", "sections/method/old"],
    ["SECTIONS/new/old", "SECTIONS", "sections/new/old"],
  ])("refuses to move sections to %s, and creates nothing", async (toPath, misspelled, asStored) => {
    expect(await refusal({ action: "move", path: "sections", toPath })).toBe(
      `${misspelled} is not in the project, but sections is, ` +
        "and this computer's disk does not tell names that differ only in case apart. " +
        `Use ${asStored}, or choose a name that differs in more than case.`,
    );
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
    expect(existsSync(join(remote.workspaceDirectory, remote.projectId, "sections/new"))).toBe(false);
  });
});
