import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

describe("moving project files into paths Git would omit", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("sections/results.tex", "Results.\n", "Add results");
    await remote.collaboratorPushes(
      ".gitignore",
      "private/\nchapters/results.tex\n",
      "Ignore private drafts",
    );
    client = await McpStdioClient.start(remote.environment());
  });

  afterEach(async () => {
    await client.stop();
    remote.cleanUp();
  });

  it.each([
    ["sections/results.tex", "private/results.tex"],
    ["sections", "chapters"],
  ])("keeps %s when its destination would disappear on push", async (path, toPath) => {
    const before = await remote.publishedHeadHash();
    const reply = await client.callRaw("manage_files", { action: "move", path, toPath });
    expect(reply.result?.isError).toBe(true);
    expect(reply.result?.content?.[0]?.text).toContain("Git ignores");
    expect(await client.call("read_file", { path: "sections/results.tex" })).toBe("Results.\n");
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
    expect(await client.call("push_changes", { commitMessage: "Publish edits" })).toContain(
      "Nothing to push",
    );
    expect(await remote.publishedHeadHash()).toBe(before);
  });
  it("honors a negated ignore rule carried by the moved folder", async () => {
    await remote.collaboratorPushes("sections/.gitignore", "!results.tex\n", "Keep results visible");
    const reply = await client.call("manage_files", { action: "move", path: "sections", toPath: "chapters" });
    expect(reply).toContain("Moved the directory sections to chapters");
    await client.call("push_changes", { commitMessage: "Move chapters" });
    expect(await remote.readPublishedFile("chapters/results.tex")).toBe("Results.\n");
  });

  it("keeps a tracked file when the folder's own ignore rule would hide its new path", async () => {
    await remote.collaboratorPushes("sections/.gitignore", "/results.tex\n", "Ignore new result files");
    const reply = await client.callRaw("manage_files", { action: "move", path: "sections", toPath: "parts" });
    expect(reply.result?.isError).toBe(true);
    expect(reply.result?.content?.[0]?.text).toContain("Git ignores parts/results.tex");
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
    expect(await client.call("read_file", { path: "sections/results.tex" })).toBe("Results.\n");
  });
});
