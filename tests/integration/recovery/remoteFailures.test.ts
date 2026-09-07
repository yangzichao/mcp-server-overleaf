import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

let remote: FakeOverleafRemote;
let client: McpStdioClient;
const originalPaper = "Original draft.\n";

beforeEach(async () => {
  remote = await FakeOverleafRemote.create();
  await remote.collaboratorPushes("main.tex", originalPaper, "Initial draft");
  client = await McpStdioClient.start(remote.environment());
  await client.call("write_file", { path: "main.tex", content: "Reviewed draft.\n" });
});

afterEach(async () => {
  await client.stop();
  remote.cleanUp();
});

describe("a rejected push", () => {
  it("preserves the commit across a server restart and retries without duplicating it", async () => {
    const rejectHook = join(remote.bareRepositoryDirectory, "hooks", "pre-receive");
    await writeFile(rejectHook, "#!/bin/sh\necho 'Temporary remote rejection' >&2\nexit 1\n");
    await chmod(rejectHook, 0o755);
    expect((await client.callRaw("push_changes", { commitMessage: "Reviewed draft" })).result?.isError).toBe(
      true,
    );
    expect(await remote.readPublishedFile("main.tex")).toBe(originalPaper);
    expect(await client.call("show_diff")).toContain("+Reviewed draft.");
    await client.stop();
    client = await McpStdioClient.start(remote.environment());
    await rm(rejectHook);
    const report = await client.call("push_changes", { commitMessage: "Retry must not add a commit" });
    expect(report).toContain("Pushed to Overleaf");
    expect(report).toContain("+Reviewed draft.");
    expect(await remote.publishedCommitSubjects()).toEqual(["Reviewed draft", "Initial draft"]);
    expect(await client.call("show_diff")).toBe("No local changes pending.");
  });
});

describe("an unavailable remote", () => {
  it("fails without deleting the draft and recovers on the same client", async () => {
    const offlineDirectory = `${remote.bareRepositoryDirectory}.offline`;
    await rename(remote.bareRepositoryDirectory, offlineDirectory);
    try {
      expect((await client.callRaw("read_file", { path: "main.tex" })).result?.isError).toBe(true);
      expect((await client.callRaw("discard_local_changes")).result?.isError).toBe(true);
      expect(await readFile(join(remote.workspaceDirectory, remote.projectId, "main.tex"), "utf8")).toBe(
        "Reviewed draft.\n",
      );
      expect(await client.call("show_diff")).toContain("+Reviewed draft.");
    } finally {
      await rename(offlineDirectory, remote.bareRepositoryDirectory);
    }
    expect(await client.call("push_changes", { commitMessage: "Recovered connection" })).toContain("Pushed");
    expect(await remote.readPublishedFile("main.tex")).toBe("Reviewed draft.\n");
  });
});
