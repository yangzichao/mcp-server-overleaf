import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { responseText } from "../support/mcpProtocol.js";

const FIRST_INTRO = "Intro, first version.\n";

describe("a folder named where a file at a revision is expected", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;
  let firstIntroHash: string;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", "\\documentclass{article}\n", "Initial draft");
    await remote.collaboratorPushes("sections/intro.tex", FIRST_INTRO, "Intro");
    firstIntroHash = await remote.publishedHeadHash();
    await remote.collaboratorPushes("sections/methods.tex", "Methods, added later.\n", "Methods");
    await remote.collaboratorPushes("sections/intro.tex", "Intro, second version.\n", "Intro again");
    client = await McpStdioClient.start(remote.environment());
  });

  afterEach(async () => {
    await client.stop();
    remote.cleanUp();
  });

  it("refuses to restore a folder, and leaves every file in it as it was", async () => {
    const response = await client.callRaw("manage_files", {
      action: "restore",
      path: "sections",
      revision: firstIntroHash,
    });
    expect(response.result?.isError).toBe(true);
    expect(responseText(response)).toBe(
      `sections was a folder at revision ${firstIntroHash}. restore puts back one file, so nothing was restored; name each file to restore.`,
    );
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
    expect(await client.call("read_file", { path: "sections/methods.tex" })).toBe("Methods, added later.\n");
  });

  it("still restores one file in that folder", async () => {
    expect(
      await client.call("manage_files", {
        action: "restore",
        path: "sections/intro.tex",
        revision: firstIntroHash,
      }),
    ).toContain(`Restored sections/intro.tex to revision ${firstIntroHash.slice(0, 7)}`);
    expect(await client.call("read_file", { path: "sections/intro.tex" })).toBe(FIRST_INTRO);
  });

  it("refuses to read a folder at a revision as if it were a file", async () => {
    const response = await client.callRaw("read_file", { path: "sections", revision: firstIntroHash });
    expect(response.result?.isError).toBe(true);
    expect(responseText(response)).toBe(`sections was a folder at revision ${firstIntroHash}, not a file.`);
  });
});
