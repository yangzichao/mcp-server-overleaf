import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { responseText } from "../support/mcpProtocol.js";

const execFileAsync = promisify(execFile);

const PAPER = "\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n";

describe("push_changes with a blank commit message", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;
  let clonePath: string;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", PAPER, "Initial draft");
    await remote.collaboratorPushes("notes.tex", "Notes.\n", "Notes");
    client = await McpStdioClient.start(remote.environment());
    const overview = await client.call("read_project", {});
    clonePath = (overview.split("\n")[0] ?? "").slice("Local clone: ".length);
    await client.call("manage_files", { action: "delete", path: "notes.tex" });
  });

  afterEach(async () => {
    await client.stop();
    remote.cleanUp();
  });

  async function cloneStatus(): Promise<string> {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: clonePath });
    return stdout;
  }

  it.each(["", "   ", "\n"])(
    "refuses %j before staging anything, and pushes nothing",
    async (commitMessage) => {
      const statusBefore = await cloneStatus();
      const response = await client.callRaw("push_changes", { commitMessage });
      expect(response.result?.isError).toBe(true);
      expect(responseText(response)).toContain(
        "Write one line saying what the change does; an empty message cannot be pushed.",
      );
      expect(await cloneStatus()).toBe(statusBefore);
      expect(await remote.listPublishedFiles()).toContain("notes.tex");
    },
  );

  it("pushes with the message trimmed", async () => {
    await client.call("push_changes", { commitMessage: "  Drop the notes\n" });
    const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%B", "main"], {
      cwd: remote.bareRepositoryDirectory,
    });
    expect(stdout.trim()).toBe("Drop the notes");
    expect(await remote.listPublishedFiles()).not.toContain("notes.tex");
  });
});
