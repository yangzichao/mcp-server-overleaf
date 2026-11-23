import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlameRefusedError } from "../../../src/overleaf/history/blame/blameFile.js";
import { OverleafGitRepository } from "../../../src/overleaf/overleafGitRepository.js";
import { FakeOverleafRemote } from "../../integration/fakeOverleafRemote.js";

/** A PNG signature and the start of its header chunk: the NUL bytes make it binary. */
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;

let remote: FakeOverleafRemote;
let repository: OverleafGitRepository;

beforeEach(async () => {
  remote = await FakeOverleafRemote.create("b5a1b2c3d4e5f6a7b8c9d0e1");
  await remote.collaboratorPushes("main.tex", "line one\nline two\nline three\n", "Initial draft");
  await remote.collaboratorPushes(
    "main.tex",
    "line one\nline TWO\nline three\nline four\n",
    "Revise line two",
  );
  await remote.collaboratorPushes("figure.png", pngBytes, "Add figure");
  await remote.collaboratorPushes("windows.tex", "first\r\nsecond\r\n", "Windows line ends");
  repository = new OverleafGitRepository({
    overleafProjectId: remote.projectId,
    repositoryDirectory: join(remote.workspaceDirectory, remote.projectId),
    overleafGitBaseUrl: remote.gitBaseUrl,
    overleafGitToken: "olp_test_token_not_a_real_secret",
    commitAuthorName: "mcp-server-overleaf",
    commitAuthorEmail: "mcp-server-overleaf@localhost",
  });
  await repository.ensureCloned();
});

afterEach(() => {
  remote.cleanUp();
});

function subjects(blame: { lines: readonly { commit?: { subject: string } | undefined }[] }) {
  return blame.lines.map((line) => line.commit?.subject);
}

describe("blame", () => {
  it("names the commit, author and date that last changed each line", async () => {
    const blame = await repository.history().blame("main.tex");
    expect(blame.deletedInClone).toBe(false);
    expect(blame.lines.map((line) => [line.lineNumber, line.text])).toEqual([
      [1, "line one"],
      [2, "line TWO"],
      [3, "line three"],
      [4, "line four"],
    ]);
    expect(subjects(blame)).toEqual(["Initial draft", "Revise line two", "Initial draft", "Revise line two"]);

    const [revision, initial] = await repository.history().listCommits({ path: "main.tex", limit: 5 });
    const commit = blame.lines[1]?.commit;
    expect(commit).toEqual({
      hash: revision?.hash,
      shortHash: revision?.shortHash,
      date: revision?.date,
      author: "A Collaborator",
      subject: "Revise line two",
    });
    expect(commit?.date).toMatch(ISO_DATE_PATTERN);
    expect(blame.lines[0]?.commit?.hash).toBe(initial?.hash);
  });

  it("blames a range of lines, stopping at the end of the file", async () => {
    const history = repository.history();
    const numbers = async (range: { startLine?: number; endLine?: number }) =>
      (await history.blame("main.tex", range)).lines.map((line) => line.lineNumber);
    expect(await numbers({ startLine: 2, endLine: 3 })).toEqual([2, 3]);
    expect(await numbers({ startLine: 3 })).toEqual([3, 4]);
    expect(await numbers({ endLine: 2 })).toEqual([1, 2]);
    expect(await numbers({ startLine: 4, endLine: 100 })).toEqual([4]);
  });

  it("refuses a range that starts past the end or is backwards", async () => {
    const history = repository.history();
    await expect(history.blame("main.tex", { startLine: 9 })).rejects.toThrow(
      "main.tex has only 4 lines, so line 9 is past the end.",
    );
    await expect(history.blame("main.tex", { startLine: 3, endLine: 2 })).rejects.toThrow(
      "startLine 3 is after endLine 2.",
    );
    await expect(history.blame("main.tex", { startLine: 0 })).rejects.toBeInstanceOf(BlameRefusedError);
    await expect(history.blame("main.tex", { endLine: 1.5 })).rejects.toThrow(/whole number/);
  });

  it("leaves a line edited in the clone and not committed without a commit", async () => {
    await repository.writeTextFile("main.tex", "line one\nlocal edit\nline three\nline four\n");
    const blame = await repository.history().blame("main.tex");
    expect(blame.lines[1]).toEqual({ lineNumber: 2, text: "local edit", commit: undefined });
    expect(subjects(blame)).toEqual(["Initial draft", undefined, "Initial draft", "Revise line two"]);
  });

  it("blames a file deleted in the clone as it was last committed", async () => {
    await repository.deleteFile("main.tex");
    const blame = await repository.history().blame("main.tex", { startLine: 2, endLine: 2 });
    expect(blame.deletedInClone).toBe(true);
    expect(blame.lines).toEqual([expect.objectContaining({ lineNumber: 2, text: "line TWO" })]);
  });

  it("says why a file cannot be blamed: missing, new in the clone, or binary", async () => {
    const history = repository.history();
    await expect(history.blame("missing.tex")).rejects.toThrow(
      "No file missing.tex in this project's history. Check the path and its case.",
    );
    await repository.writeTextFile("new.tex", "fresh\n");
    await expect(history.blame("new.tex")).rejects.toThrow(/new.tex has no history yet/);
    await expect(history.blame("figure.png")).rejects.toThrow(
      "figure.png is a binary file; blame reads text files only.",
    );
    await expect(history.blame("../outside.tex")).rejects.toThrow();
  });

  it("drops the carriage return from a CRLF file's lines", async () => {
    const blame = await repository.history().blame("windows.tex");
    expect(blame.lines.map((line) => line.text)).toEqual(["first", "second"]);
  });

  it("still works when the user's Git configuration names an ignore-revs file this project lacks", async () => {
    const saved = { count: process.env.GIT_CONFIG_COUNT };
    const index = Number(saved.count ?? "0");
    process.env.GIT_CONFIG_COUNT = String(index + 1);
    process.env[`GIT_CONFIG_KEY_${index}`] = "blame.ignoreRevsFile";
    process.env[`GIT_CONFIG_VALUE_${index}`] = ".git-blame-ignore-revs";
    try {
      expect((await repository.history().blame("main.tex")).lines).toHaveLength(4);
    } finally {
      if (saved.count === undefined) delete process.env.GIT_CONFIG_COUNT;
      else process.env.GIT_CONFIG_COUNT = saved.count;
      delete process.env[`GIT_CONFIG_KEY_${index}`];
      delete process.env[`GIT_CONFIG_VALUE_${index}`];
    }
  });
});
