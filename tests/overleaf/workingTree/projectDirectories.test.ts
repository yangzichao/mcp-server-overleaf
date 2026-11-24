import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolvePathInsideRepository } from "../../../src/overleaf/repositoryPaths.js";
import { ProjectDirectories } from "../../../src/overleaf/workingTree/projectDirectories.js";

describe("what a path names in the working tree", () => {
  let repositoryDirectory = "";

  beforeEach(async () => {
    repositoryDirectory = await realpath(await mkdtemp(join(tmpdir(), "project-directories-")));
  });

  afterEach(async () => {
    await rm(repositoryDirectory, { recursive: true, force: true });
  });

  function directories(): ProjectDirectories {
    return new ProjectDirectories({
      repositoryDirectory,
      git: () => Promise.reject(new Error("Reading a path's kind runs no git command.")),
      resolveClientPath: (relativePath) =>
        Promise.resolve(resolvePathInsideRepository(repositoryDirectory, relativePath)),
      materializePathIfNeeded: () => Promise.resolve(),
      materializeAllFiles: () => Promise.resolve(),
    });
  }

  it("reads a path under a file as missing, since nothing can be there", async () => {
    await writeFile(join(repositoryDirectory, "plot.png"), "not really a figure");
    expect(await directories().describePathKind("plot.png/a")).toBe("missing");
    expect(await directories().describePathKind("plot.png")).toBe("file");
    expect(await directories().describePathKind("figures")).toBe("missing");
  });
});
