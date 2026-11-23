import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * The project's history through the MCP protocol: listing it, reading and comparing old
 * revisions, and restoring a file from one. Each test builds a short history as a
 * collaborator would, through pushes to the fake Overleaf remote.
 */

const FIRST_DRAFT = "\\section{Intro}\nFirst draft.\n";
const SECOND_DRAFT = "\\section{Intro}\nSecond draft, much better.\n";
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0xff]);

describe("the project history tools", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient | undefined;
  let firstDraftHash: string;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", FIRST_DRAFT, "First draft");
    firstDraftHash = await remote.publishedHeadHash();
    await remote.collaboratorPushes("figures/plot.png", PNG_BYTES, "Add the plot");
    await remote.collaboratorPushes("main.tex", SECOND_DRAFT, "Rewrite the intro");
  });

  afterEach(async () => {
    await client?.stop();
    client = undefined;
    remote.cleanUp();
  });

  async function startClient(): Promise<McpStdioClient> {
    client = await McpStdioClient.start(remote.environment());
    return client;
  }

  it("lists commits newest first with the files each changed", async () => {
    const listed = await (await startClient()).call("read_history", {});
    expect(listed).toContain("3 commits for the project, newest first:");
    const rewrite = listed.indexOf("Rewrite the intro");
    const plot = listed.indexOf("Add the plot");
    const draft = listed.indexOf("First draft");
    expect(rewrite).toBeGreaterThan(-1);
    expect(rewrite).toBeLessThan(plot);
    expect(plot).toBeLessThan(draft);
    expect(listed).toContain("A Collaborator");
    expect(listed).toContain("added figures/plot.png");
    expect(listed).toContain("changed main.tex");
    expect(listed).toContain(firstDraftHash.slice(0, 7));
  });

  it("narrows the history to one file, a date range and a limit", async () => {
    const mcp = await startClient();
    const forMain = await mcp.call("read_history", { path: "main.tex" });
    expect(forMain).toContain("2 commits for main.tex");
    expect(forMain).not.toContain("Add the plot");

    expect(await mcp.call("read_history", { since: "2090-01-01" })).toContain(
      "No commits found for the project.",
    );
    expect(await mcp.call("read_history", { until: "2000-01-01" })).toContain("No commits found");

    const newest = await mcp.call("read_history", { limit: 1 });
    expect(newest).toContain("1 commit for the project");
    expect(newest).toContain("Showing the newest 1");
  });

  // Git reads a bare date as that day at the current time of day, which drops the commits made
  // a moment ago. Found against the real Git bridge, where it hid a commit from that morning.
  it("counts the whole day for a bare since or until date", async () => {
    const now = new Date();
    const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((part) => String(part).padStart(2, "0"))
      .join("-");
    const mcp = await startClient();
    expect(await mcp.call("read_history", { since: today })).toContain("3 commits for the project");
    expect(await mcp.call("read_history", { until: today })).toContain("3 commits for the project");
  });

  it("refuses a date Git would silently ignore, or one that could be read as an option", async () => {
    const mcp = await startClient();
    for (const since of ["--all", "2999-01-01", "2026-02-31", "last tuesday-ish"]) {
      expect(await mcp.call("read_history", { since })).toContain("Input validation error");
    }
  });

  it("reads a file as it was at an earlier revision", async () => {
    const mcp = await startClient();
    const old = await mcp.call("read_file", { path: "main.tex", revision: firstDraftHash.slice(0, 7) });
    expect(old).toBe(FIRST_DRAFT);
    const numbered = await mcp.call("read_file", {
      path: "main.tex",
      revision: firstDraftHash,
      startLine: 2,
    });
    expect(numbered).toBe("2\tFirst draft.\n3\t");
  });

  it("names read_history when a revision does not exist or the file did not", async () => {
    const mcp = await startClient();
    expect(await mcp.call("read_file", { path: "main.tex", revision: "deadbeef" })).toContain(
      "No commit deadbeef in this project's history",
    );
    expect(await mcp.call("read_file", { path: "figures/plot.png", revision: firstDraftHash })).toContain(
      "did not exist at revision",
    );
  });

  it("compares two revisions, or a revision with Overleaf's latest", async () => {
    const mcp = await startClient();
    const sinceFirst = await mcp.call("read_history", { view: "diff", fromRevision: firstDraftHash });
    expect(sinceFirst).toContain("-First draft.");
    expect(sinceFirst).toContain("+Second draft, much better.");
    expect(sinceFirst).toContain("figures/plot.png");

    const onlyMain = await mcp.call("read_history", {
      view: "diff",
      fromRevision: firstDraftHash,
      path: "main.tex",
    });
    expect(onlyMain).not.toContain("plot.png");

    const nothing = await mcp.call("read_history", {
      view: "diff",
      fromRevision: firstDraftHash,
      toRevision: firstDraftHash,
    });
    expect(nothing).toContain("No differences in the project");
  });

  it("says which argument a view needs and which view an argument belongs to", async () => {
    const mcp = await startClient();
    expect(await mcp.call("read_history", { view: "diff", toRevision: firstDraftHash })).toBe(
      "diff needs fromRevision.",
    );
    expect(await mcp.call("read_history", { toRevision: firstDraftHash })).toBe(
      "toRevision does not apply to commits; diff uses it.",
    );
    expect(await mcp.call("read_history", { view: "diff", fromRevision: firstDraftHash, limit: 3 })).toBe(
      "limit does not apply to diff; commits uses it.",
    );
  });

  it("restores a text file from an earlier revision, locally until pushed", async () => {
    const mcp = await startClient();
    const restored = await mcp.call("manage_files", {
      action: "restore",
      path: "main.tex",
      revision: firstDraftHash.slice(0, 7),
    });
    expect(restored).toContain(`Restored main.tex to revision ${firstDraftHash.slice(0, 7)}`);
    expect(await mcp.call("read_file", { path: "main.tex" })).toBe(FIRST_DRAFT);
    expect(await remote.readPublishedFile("main.tex")).toBe(SECOND_DRAFT);

    const pending = await mcp.call("read_project", { view: "changes", path: "main.tex" });
    expect(pending).toContain("+First draft.");
  });

  it("brings back a deleted binary file byte for byte", async () => {
    const withPlotHash = await remote.publishedHeadHash();
    await remote.collaboratorDeletes("figures/plot.png", "Drop the plot");
    const mcp = await startClient();
    await mcp.call("manage_files", { action: "restore", path: "figures/plot.png", revision: withPlotHash });
    await mcp.call("push_changes", { commitMessage: "Bring the plot back" });
    expect(await remote.readPublishedBytes("figures/plot.png")).toEqual(PNG_BYTES);
  });

  it("refuses to restore a file that did not exist at that revision", async () => {
    const answer = await (await startClient()).call("manage_files", {
      action: "restore",
      path: "figures/plot.png",
      revision: firstDraftHash,
    });
    expect(answer).toContain("did not exist at revision");
    expect(answer).toContain("use manage_files with action delete");
  });
});
