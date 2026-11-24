import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

const BIBLIOGRAPHY = "@article{first,\n  title = {First},\n}";

describe("edit_file append on the local clone", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("refs.bib", BIBLIOGRAPHY, "Bibliography without a final newline");
    await remote.collaboratorPushes("notes.txt", "One.\n", "Notes ending in a newline");
    client = await McpStdioClient.start(remote.environment());
  });

  afterEach(async () => {
    await client?.stop();
    remote.cleanUp();
  });

  it("starts the appended text on a new line and publishes it on push", async () => {
    const answer = await client.call("edit_file", {
      action: "append",
      path: "refs.bib",
      content: "@article{second,\n  title = {Second},\n}\n",
    });
    expect(answer).toContain("Appended 3 lines to the end of refs.bib.");
    expect(answer).toContain("push_changes");
    expect(await client.call("read_file", { path: "refs.bib" })).toBe(
      `${BIBLIOGRAPHY}\n@article{second,\n  title = {Second},\n}\n`,
    );

    await client.call("push_changes", { commitMessage: "Cite the second paper" });
    expect(await remote.readPublishedFile("refs.bib")).toContain("@article{second,");
  });

  it("adds no blank line when the file already ends with a newline", async () => {
    await client.call("edit_file", { action: "append", path: "notes.txt", content: "Two." });
    expect(await client.call("read_file", { path: "notes.txt" })).toBe("One.\nTwo.");
  });

  it("refuses a missing file and points at write", async () => {
    const response = await client.callRaw("edit_file", {
      action: "append",
      path: "absent.tex",
      content: "x",
    });
    expect(response.result?.isError).toBe(true);
    expect(response.result?.content?.[0]?.text).toContain("use action write to create it");
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  });

  it("honours expectedRevision like the other actions", async () => {
    const first = JSON.parse(await client.call("read_file", { path: "notes.txt", mode: "full" }));
    await remote.collaboratorPushes("notes.txt", "One.\nA co-author's line.\n", "Collaborator edit");
    const stale = await client.callRaw("edit_file", {
      action: "append",
      path: "notes.txt",
      content: "Mine.\n",
      expectedRevision: first.revision,
    });
    expect(stale.result?.isError).toBe(true);
    expect(await client.call("read_file", { path: "notes.txt" })).toBe("One.\nA co-author's line.\n");
  });

  it("needs content and refuses arguments it does not use", async () => {
    const missing = await client.callRaw("edit_file", { action: "append", path: "notes.txt" });
    expect(missing.result?.content?.[0]?.text).toBe("append needs content.");
    const extra = await client.callRaw("edit_file", {
      action: "append",
      path: "notes.txt",
      content: "x",
      sectionTitle: "Intro",
    });
    expect(extra.result?.content?.[0]?.text).toBe(
      "sectionTitle does not apply to append; replace_section uses it.",
    );
  });
});
