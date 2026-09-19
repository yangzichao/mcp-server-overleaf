import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OverleafGitRepository } from "../../src/overleaf/overleafGitRepository.js";
import { FakeOverleafRemote } from "../integration/fakeOverleafRemote.js";

/**
 * resolvePathInsideRepository does path arithmetic only, so a symlink inside the clone
 * is invisible to it. Git can carry symlinks, which means one can arrive from Overleaf,
 * and the paths reaching these methods come from a model that has been reading a
 * co-author's prose. These tests hold that second guard in place.
 */
let remote: FakeOverleafRemote;
let repository: OverleafGitRepository;
let outsideDirectory: string;
let secretFile: string;

beforeEach(async () => {
  remote = await FakeOverleafRemote.create("c4a1b2c3d4e5f6a7b8c9d0e1");
  await remote.collaboratorPushes("main.tex", "\\section{A}\n", "Initial draft");

  repository = new OverleafGitRepository({
    overleafProjectId: remote.projectId,
    repositoryDirectory: join(remote.workspaceDirectory, remote.projectId),
    overleafGitBaseUrl: remote.gitBaseUrl,
    overleafGitToken: "olp_test_token_not_a_real_secret",
    commitAuthorName: "mcp-server-overleaf",
    commitAuthorEmail: "mcp-server-overleaf@localhost",
  });
  await repository.ensureCloned();

  outsideDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcp-outside-"));
  secretFile = join(outsideDirectory, "id_rsa");
  await writeFile(secretFile, "PRIVATE KEY MATERIAL\n", "utf8");
});

afterEach(() => {
  remote.cleanUp();
  rmSync(outsideDirectory, { recursive: true, force: true });
});

const repositoryPath = (...parts: string[]) => join(remote.workspaceDirectory, remote.projectId, ...parts);

describe("a symlink pointing out of the clone", () => {
  it("cannot be read through", async () => {
    await symlink(secretFile, repositoryPath("notes.tex"));
    await expect(repository.readTextFile("notes.tex")).rejects.toThrow(/symbolic links/);
  });

  it("cannot be written through, and the target is left alone", async () => {
    await symlink(secretFile, repositoryPath("notes.tex"));
    await expect(repository.writeTextFile("notes.tex", "clobbered")).rejects.toThrow(/symbolic links/);
    expect(await repository.readTextFile("main.tex")).toContain("\\section{A}");
  });

  it("is reported as absent rather than as an existing file", async () => {
    await symlink(secretFile, repositoryPath("notes.tex"));
    expect(await repository.fileExists("notes.tex")).toBe(false);
  });

  it("cannot be reached as a directory in the middle of a path", async () => {
    await symlink(outsideDirectory, repositoryPath("sections"));
    await expect(repository.readTextFile("sections/id_rsa")).rejects.toThrow(/symbolic links/);
  });

  it("cannot be written to through a linked directory that does not yet hold the file", async () => {
    await symlink(outsideDirectory, repositoryPath("sections"));
    await expect(repository.writeTextFile("sections/new.tex", "x")).rejects.toThrow(/symbolic links/);
  });
});

describe("a symlink and a file that would be removed or moved", () => {
  it("is not deleted through, and the target survives", async () => {
    await symlink(secretFile, repositoryPath("notes.tex"));
    await expect(repository.deleteFile("notes.tex")).rejects.toThrow(/symbolic links/);
    expect(await readFile(secretFile, "utf8")).toBe("PRIVATE KEY MATERIAL\n");
  });

  it("is not reached as a directory on the way to a delete", async () => {
    await symlink(outsideDirectory, repositoryPath("sections"));
    await expect(repository.deleteFile("sections/id_rsa")).rejects.toThrow(/symbolic links/);
    expect(await readFile(secretFile, "utf8")).toBe("PRIVATE KEY MATERIAL\n");
  });

  it("cannot be the source of a move, which would carry the target into the clone", async () => {
    await symlink(secretFile, repositoryPath("notes.tex"));
    await expect(repository.moveFile("notes.tex", "stolen.tex")).rejects.toThrow(/symbolic links/);
    expect(await readFile(secretFile, "utf8")).toBe("PRIVATE KEY MATERIAL\n");
  });

  // The destination does not exist yet, so containment has to be decided from the nearest
  // existing ancestor. Without that, a move would write a co-author's file outside the clone.
  it("cannot be the destination of a move through a linked directory", async () => {
    await symlink(outsideDirectory, repositoryPath("figures"));
    await expect(repository.moveFile("main.tex", "figures/main.tex")).rejects.toThrow(/symbolic links/);
    expect(await repository.readTextFile("main.tex")).toContain("\\section{A}");
  });

  it("refuses a move whose destination climbs out of the clone", async () => {
    await expect(repository.moveFile("main.tex", "../escaped.tex")).rejects.toThrow();
    expect(await repository.readTextFile("main.tex")).toContain("\\section{A}");
  });

  it("refuses to delete a directory, which would take a co-author\u2019s files with it", async () => {
    await repository.writeTextFile("sections/intro.tex", "fresh\n");
    await expect(repository.deleteFile("sections")).rejects.toThrow(/directory, not a file/);
    expect(await repository.readTextFile("sections/intro.tex")).toBe("fresh\n");
  });
});

describe("a symlink pointing into .git", () => {
  it("cannot be used to walk around the .git guard", async () => {
    await symlink(repositoryPath(".git", "config"), repositoryPath("innocent.tex"));
    await expect(repository.readTextFile("innocent.tex")).rejects.toThrow(/\.git directory/);
  });

  it("cannot overwrite the hooks directory, which would be code execution", async () => {
    await mkdir(repositoryPath(".git", "hooks"), { recursive: true });
    await symlink(repositoryPath(".git", "hooks"), repositoryPath("figures"));
    await expect(repository.writeTextFile("figures/pre-commit", "#!/bin/sh\n")).rejects.toThrow(
      /\.git directory/,
    );
  });

  it("cannot be used to delete the repository\u2019s own history", async () => {
    await symlink(repositoryPath(".git", "config"), repositoryPath("innocent.tex"));
    await expect(repository.deleteFile("innocent.tex")).rejects.toThrow(/\.git directory/);
    expect(await repository.fileExists("main.tex")).toBe(true);
  });

  it("cannot be the destination of a move into .git", async () => {
    await symlink(repositoryPath(".git"), repositoryPath("figures"));
    await expect(repository.moveFile("main.tex", "figures/hooks/pre-commit")).rejects.toThrow(
      /\.git directory/,
    );
  });
});

describe("ordinary paths still work", () => {
  it("reads a real file", async () => {
    expect(await repository.readTextFile("main.tex")).toContain("\\section{A}");
  });

  it("writes a new file in a directory that does not exist yet", async () => {
    await repository.writeTextFile("sections/intro.tex", "fresh\n");
    expect(await repository.readTextFile("sections/intro.tex")).toBe("fresh\n");
  });

  it("allows a symlink that stays inside the clone", async () => {
    await symlink(repositoryPath("main.tex"), repositoryPath("alias.tex"));
    expect(await repository.readTextFile("alias.tex")).toContain("\\section{A}");
  });

  it("deletes a real file", async () => {
    await repository.deleteFile("main.tex");
    expect(await repository.fileExists("main.tex")).toBe(false);
  });

  it("moves a file into a directory that does not exist yet", async () => {
    await repository.moveFile("main.tex", "sections/main.tex");
    expect(await repository.fileExists("main.tex")).toBe(false);
    expect(await repository.readTextFile("sections/main.tex")).toContain("\\section{A}");
  });
});
