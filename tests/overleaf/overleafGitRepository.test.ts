import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OverleafGitRepository } from "../../src/overleaf/overleafGitRepository.js";
import { publishToOverleaf } from "../../src/workflow/publishToOverleaf.js";
import { synchronizeWithOverleaf } from "../../src/workflow/synchronizeWithOverleaf.js";
import { FakeOverleafRemote } from "../integration/fakeOverleafRemote.js";

const originalPaper = ["\\section{Introduction}", "The sample size is 5000.", "\\end{document}"].join("\n");

/** A minimal PDF header: the NUL byte is what marks it as binary. */
const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x00, 0x0a, 0xff]);

let remote: FakeOverleafRemote;
let repository: OverleafGitRepository;

beforeEach(async () => {
  remote = await FakeOverleafRemote.create("a4a1b2c3d4e5f6a7b8c9d0e1");
  await remote.collaboratorPushes("main.tex", originalPaper, "Initial draft");

  repository = new OverleafGitRepository({
    overleafProjectId: remote.projectId,
    repositoryDirectory: join(remote.workspaceDirectory, remote.projectId),
    overleafGitBaseUrl: remote.gitBaseUrl,
    overleafGitToken: "olp_test_token_not_a_real_secret",
    commitAuthorName: "mcp-server-overleaf",
    commitAuthorEmail: "mcp-server-overleaf@localhost",
  });
});

afterEach(() => {
  remote.cleanUp();
});

describe("ensureCloned", () => {
  it("clones on first use", async () => {
    await repository.ensureCloned();
    expect(await repository.listTrackedFiles()).toEqual(["main.tex"]);
  });

  it("is a cheap no-op on later calls", async () => {
    await repository.ensureCloned();
    const headAfterFirst = await repository.getHeadCommitHash();
    await repository.ensureCloned();
    expect(await repository.getHeadCommitHash()).toBe(headAfterFirst);
  });

  it("clones onto the branch Overleaf uses", async () => {
    await repository.ensureCloned();
    expect(await repository.getBranchName()).toBe("main");
  });

  it("writes local excludes so operating-system junk is never published", async () => {
    await repository.ensureCloned();
    const excludes = await readFile(
      join(remote.workspaceDirectory, remote.projectId, ".git", "info", "exclude"),
      "utf8",
    );
    expect(excludes).toContain(".DS_Store");
  });

  it("does not commit a .DS_Store a co-author would then receive", async () => {
    await repository.ensureCloned();
    await repository.writeTextFile(".DS_Store", "finder junk");
    await repository.writeTextFile("main.tex", "a real edit\n");

    await repository.stageAllAndCommit("an edit");
    expect(await repository.listTrackedFiles()).not.toContain(".DS_Store");
  });

  it("records the configured commit author", async () => {
    await repository.ensureCloned();
    await repository.writeTextFile("main.tex", "changed\n");
    await repository.stageAllAndCommit("a change");
    expect(await repository.getRecentCommitLog(1)).toContain("mcp-server-overleaf");
  });
});

describe("reading and writing files", () => {
  beforeEach(() => repository.ensureCloned());

  it("round-trips a file", async () => {
    await repository.writeTextFile("sections/new.tex", "fresh content\n");
    expect(await repository.readTextFile("sections/new.tex")).toBe("fresh content\n");
  });

  it("creates intermediate directories", async () => {
    await repository.writeTextFile("a/b/c/deep.tex", "x");
    expect(await repository.fileExists("a/b/c/deep.tex")).toBe(true);
  });

  it("reports a missing file as absent rather than throwing", async () => {
    expect(await repository.fileExists("nope.tex")).toBe(false);
  });

  it("refuses to return a binary file as text", async () => {
    await writeFile(join(remote.workspaceDirectory, remote.projectId, "figure.pdf"), pdfBytes);
    await expect(repository.readTextFile("figure.pdf")).rejects.toThrow(/binary file/);
  });

  it("still reads a text file containing accented characters", async () => {
    await repository.writeTextFile("names.tex", "Sant'Anna, Émile, 北京\n");
    expect(await repository.readTextFile("names.tex")).toBe("Sant'Anna, Émile, 北京\n");
  });

  it("refuses a path outside the clone", async () => {
    await expect(repository.readTextFile("../escape.tex")).rejects.toThrow(/outside the project/);
  });
});

describe("describeRemoteDivergence", () => {
  beforeEach(() => repository.ensureCloned());

  it("sees no drift on a fresh clone", async () => {
    expect(await repository.describeRemoteDivergence()).toMatchObject({
      commitsOnlyOnRemote: 0,
      commitsOnlyOnLocal: 0,
    });
  });

  it("counts a local commit that has not been pushed", async () => {
    await repository.writeTextFile("main.tex", "local edit\n");
    await repository.stageAllAndCommit("local only");
    expect((await repository.describeRemoteDivergence()).commitsOnlyOnLocal).toBe(1);
  });

  it("counts a collaborator commit once it has been fetched", async () => {
    await remote.collaboratorPushes("notes.tex", "theirs\n", "Co-author adds notes");
    await repository.fetchRemote();
    expect((await repository.describeRemoteDivergence()).commitsOnlyOnRemote).toBe(1);
  });
});

describe("stageAllAndCommit", () => {
  beforeEach(() => repository.ensureCloned());

  it("commits pending work", async () => {
    await repository.writeTextFile("main.tex", "edited\n");
    expect(await repository.stageAllAndCommit("an edit")).toMatchObject({ committed: true });
  });

  it("reports nothing to commit when the tree is clean", async () => {
    expect(await repository.stageAllAndCommit("nothing")).toMatchObject({ committed: false });
  });
});

describe("discardAllLocalChanges", () => {
  beforeEach(() => repository.ensureCloned());

  it("drops an unpushed commit, so a refused push is not a dead end", async () => {
    // Exactly the state publishToOverleaf leaves behind when it refuses: the local commit
    // survives the aborted rebase, and the clone is both ahead of and behind Overleaf.
    await repository.writeTextFile("main.tex", originalPaper.replace("5000", "8000"));
    await repository.stageAllAndCommit("our correction");
    await remote.collaboratorPushes("main.tex", originalPaper.replace("5000", "20000"), "theirs");
    await publishToOverleaf(repository, "our correction");

    expect(await repository.discardAllLocalChanges()).toEqual({ discardedCommits: 1 });

    const divergence = await repository.describeRemoteDivergence();
    expect(divergence).toMatchObject({ commitsOnlyOnLocal: 0, commitsOnlyOnRemote: 0 });
    expect(await repository.readTextFile("main.tex")).toContain("20000");
  });

  it("leaves the clone usable, so the next sync is clean", async () => {
    await repository.writeTextFile("main.tex", originalPaper.replace("5000", "8000"));
    await repository.stageAllAndCommit("our correction");
    await remote.collaboratorPushes("main.tex", originalPaper.replace("5000", "20000"), "theirs");
    await publishToOverleaf(repository, "our correction");
    await repository.discardAllLocalChanges();

    expect(await synchronizeWithOverleaf(repository)).toMatchObject({ rebaseConflict: null });
  });

  it("reports discarding nothing when there is nothing to discard", async () => {
    expect(await repository.discardAllLocalChanges()).toEqual({ discardedCommits: 0 });
  });

  it("restores a modified file and removes a new one", async () => {
    await repository.writeTextFile("main.tex", "clobbered\n");
    await repository.writeTextFile("stray.tex", "should not survive\n");

    await repository.discardAllLocalChanges();

    expect(await repository.readTextFile("main.tex")).toBe(originalPaper);
    expect(await repository.fileExists("stray.tex")).toBe(false);
  });
});

describe("synchronizeWithOverleaf", () => {
  it("clones, then reports a clean state", async () => {
    const result = await synchronizeWithOverleaf(repository);
    expect(result).toMatchObject({ branchName: "main", pulledCommits: 0, rebaseConflict: null });
  });

  it("pulls a collaborator's commit in", async () => {
    await synchronizeWithOverleaf(repository);
    await remote.collaboratorPushes("notes.tex", "theirs\n", "Co-author adds notes");

    expect(await synchronizeWithOverleaf(repository)).toMatchObject({ pulledCommits: 1 });
    expect(await repository.fileExists("notes.tex")).toBe(true);
  });

  it("rebases local work on top of theirs when the edits do not overlap", async () => {
    await synchronizeWithOverleaf(repository);
    await repository.writeTextFile("ours.tex", "ours\n");
    await repository.stageAllAndCommit("our work");
    await remote.collaboratorPushes("notes.tex", "theirs\n", "Co-author adds notes");

    const result = await synchronizeWithOverleaf(repository);
    expect(result.rebaseConflict).toBeNull();
    expect(result.localCommitsNotYetPushed).toBe(1);
    expect(await repository.fileExists("notes.tex")).toBe(true);
  });

  it("reports a conflict instead of guessing, and aborts the rebase", async () => {
    await synchronizeWithOverleaf(repository);
    await repository.writeTextFile("main.tex", originalPaper.replace("5000", "8000"));
    await repository.stageAllAndCommit("our correction");
    await remote.collaboratorPushes("main.tex", originalPaper.replace("5000", "20000"), "theirs");

    const result = await synchronizeWithOverleaf(repository);
    expect(result.rebaseConflict).not.toBeNull();
    // The clone must still be usable, not parked mid-rebase.
    expect(await repository.getBranchName()).toBe("main");
    expect(await readdir(join(remote.workspaceDirectory, remote.projectId, ".git"))).not.toContain(
      "rebase-merge",
    );
  });
});

describe("publishToOverleaf", () => {
  beforeEach(() => synchronizeWithOverleaf(repository));

  it("says there is nothing to push when nothing changed", async () => {
    expect(await publishToOverleaf(repository, "empty")).toMatchObject({ status: "nothing-to-push" });
  });

  it("publishes a change and reports the diff", async () => {
    await repository.writeTextFile("main.tex", originalPaper.replace("5000", "8000"));
    const outcome = await publishToOverleaf(repository, "Correct the sample size");

    expect(outcome.status).toBe("pushed");
    expect(await remote.readPublishedFile("main.tex")).toContain("8000");
    if (outcome.status === "pushed") expect(outcome.diff).toContain("8000");
  });

  it("rebases onto a collaborator's unrelated commit before pushing", async () => {
    await repository.writeTextFile("ours.tex", "ours\n");
    await remote.collaboratorPushes("theirs.tex", "theirs\n", "Co-author adds a file");

    expect(await publishToOverleaf(repository, "our file")).toMatchObject({ status: "pushed" });
    expect(await remote.readPublishedFile("theirs.tex")).toContain("theirs");
    expect(await remote.readPublishedFile("ours.tex")).toContain("ours");
  });

  it("refuses when both sides changed the same line, leaving Overleaf untouched", async () => {
    await repository.writeTextFile("main.tex", originalPaper.replace("5000", "8000"));
    await remote.collaboratorPushes("main.tex", originalPaper.replace("5000", "20000"), "theirs");

    expect(await publishToOverleaf(repository, "our correction")).toMatchObject({
      status: "conflict-with-collaborator",
    });

    const published = await remote.readPublishedFile("main.tex");
    expect(published).toContain("20000");
    expect(published).not.toContain("8000");
    expect(await remote.publishedCommitSubjects()).not.toContain("our correction");
  });
});
