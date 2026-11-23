import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * read_history (view blame) through the protocol: each line after the commit that last changed
 * it, then those commits newest first, with local edits marked as not committed.
 */

const FIRST_DRAFT = "\\section{Intro}\nFirst draft.\nThe end.\n";
const SECOND_DRAFT = "\\section{Intro}\nSecond draft, much better.\nThe end.\n";

let remote: FakeOverleafRemote;
let client: McpStdioClient | undefined;
let firstDraftHash: string;
let rewriteHash: string;

/** Commits as the co-author with a fixed date, so the order and the dates shown are known. */
async function collaboratorPushesOn(isoDate: string, path: string, content: string, message: string) {
  process.env.GIT_AUTHOR_DATE = isoDate;
  process.env.GIT_COMMITTER_DATE = isoDate;
  try {
    await remote.collaboratorPushes(path, content, message);
  } finally {
    Reflect.deleteProperty(process.env, "GIT_AUTHOR_DATE");
    Reflect.deleteProperty(process.env, "GIT_COMMITTER_DATE");
  }
}

beforeEach(async () => {
  remote = await FakeOverleafRemote.create();
  await collaboratorPushesOn("2026-03-01T10:00:00+00:00", "main.tex", FIRST_DRAFT, "First draft");
  firstDraftHash = await remote.publishedHeadHash();
  await collaboratorPushesOn("2026-03-02T10:00:00+00:00", "main.tex", SECOND_DRAFT, "Rewrite the intro");
  rewriteHash = await remote.publishedHeadHash();
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

/** A blame line, with the short hash matched by its first seven characters. */
function blameLine(lineNumber: number, hash: string, day: string, text: string): RegExp {
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${lineNumber}\\t${hash.slice(0, 7)}[0-9a-f]* ${day} A Collaborator\\t${escapedText}$`,
    "m",
  );
}

describe("read_history view blame", () => {
  it("gives each line the commit that last changed it, then those commits newest first", async () => {
    const blamed = await (await startClient()).call("read_history", { view: "blame", path: "main.tex" });
    expect(blamed).toContain("main.tex, lines 1-3, each with the commit that last changed it:");
    expect(blamed).toMatch(blameLine(1, firstDraftHash, "2026-03-01", "\\section{Intro}"));
    expect(blamed).toMatch(blameLine(2, rewriteHash, "2026-03-02", "Second draft, much better."));
    expect(blamed).toMatch(blameLine(3, firstDraftHash, "2026-03-01", "The end."));

    const commits = blamed.slice(blamed.indexOf("Commits, newest first:"));
    expect(commits).toContain(`- ${rewriteHash.slice(0, 7)}`);
    expect(commits).toContain("2026-03-02T10:00:00Z  A Collaborator  Rewrite the intro");
    expect(commits.indexOf("Rewrite the intro")).toBeLessThan(commits.indexOf("First draft"));
    expect(blamed).not.toContain("not committed yet");
  });

  it("blames only the lines asked for", async () => {
    const blamed = await (await startClient()).call("read_history", {
      view: "blame",
      path: "main.tex",
      startLine: 2,
      endLine: 2,
    });
    expect(blamed).toContain("main.tex, lines 2-2, each with the commit that last changed it:");
    expect(blamed).toMatch(blameLine(2, rewriteHash, "2026-03-02", "Second draft, much better."));
    expect(blamed).not.toContain("\\section{Intro}");
    expect(blamed).not.toContain("First draft");
  });

  it("marks a line edited in the clone and not pushed", async () => {
    const mcp = await startClient();
    await mcp.call("edit_file", {
      action: "replace_text",
      path: "main.tex",
      findText: "The end.",
      replaceWith: "The real end.",
    });
    const blamed = await mcp.call("read_history", { view: "blame", path: "main.tex" });
    expect(blamed).toMatch(/^3\tnot committed yet\tThe real end\.$/m);
    expect(blamed).toContain("Lines marked not committed yet were changed in the clone and are not pushed.");
  });

  it("refuses a blame without path, and a line range on another view, before Git runs", async () => {
    const mcp = await startClient();
    const withoutPath = await mcp.callRaw("read_history", { view: "blame" });
    expect(withoutPath.result?.isError).toBe(true);
    expect(withoutPath.result?.content?.[0]?.text).toBe("blame needs path.");

    const rangeOnCommits = await mcp.callRaw("read_history", { view: "commits", startLine: 2 });
    expect(rangeOnCommits.result?.isError).toBe(true);
    expect(rangeOnCommits.result?.content?.[0]?.text).toBe(
      "startLine does not apply to commits; blame uses it.",
    );
  });
});
