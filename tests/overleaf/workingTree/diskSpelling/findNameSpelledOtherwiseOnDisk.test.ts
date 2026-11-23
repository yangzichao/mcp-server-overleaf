import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findNameSpelledOtherwiseOnDisk } from "../../../../src/overleaf/workingTree/diskSpelling/findNameSpelledOtherwiseOnDisk.js";
import { temporaryDiskIgnoresCase } from "../../../support/temporaryDiskIgnoresCase.js";

let repositoryDirectory = "";

beforeEach(async () => {
  repositoryDirectory = await realpath(await mkdtemp(join(tmpdir(), "disk-spelling-")));
  await mkdir(join(repositoryDirectory, "sections/method"), { recursive: true });
  await writeFile(join(repositoryDirectory, "main.tex"), "\\documentclass{article}\n");
  await writeFile(join(repositoryDirectory, "sections/method/setup.tex"), "\\section{Setup}\n");
  await writeFile(join(repositoryDirectory, "caf\u00e9.tex"), "Caf\u00e9.\n");
});

afterEach(async () => {
  await rm(repositoryDirectory, { recursive: true, force: true });
});

const nothingTracked = () => Promise.resolve(false);

describe("a path spelled as the disk stores it, or not there at all", () => {
  it.each([
    "main.tex",
    "sections",
    "sections/method/setup.tex",
    "sections/new.tex",
    "figures/plot.png",
    "main.tex/inside-a-file.tex",
  ])("passes %s", async (gitPath) => {
    expect(
      await findNameSpelledOtherwiseOnDisk(repositoryDirectory, gitPath, nothingTracked),
    ).toBeUndefined();
  });

  it("passes a name that differs from the stored one only in Unicode normalization", async () => {
    const decomposed = "cafe\u0301.tex";
    expect(
      await findNameSpelledOtherwiseOnDisk(repositoryDirectory, decomposed, nothingTracked),
    ).toBeUndefined();
  });
});

describe.runIf(temporaryDiskIgnoresCase())("a path that differs in case on a disk that ignores case", () => {
  it("names the first name spelled otherwise, the stored spelling and the whole path as stored", async () => {
    expect(
      await findNameSpelledOtherwiseOnDisk(repositoryDirectory, "Sections/METHOD/new.tex", nothingTracked),
    ).toEqual({
      requestedPathUpToTheMisspelledName: "Sections",
      storedPathUpToTheMisspelledName: "sections",
      wholePathAsStored: "sections/METHOD/new.tex",
    });
    expect(
      await findNameSpelledOtherwiseOnDisk(repositoryDirectory, "sections/Method/setup.tex", nothingTracked),
    ).toEqual({
      requestedPathUpToTheMisspelledName: "sections/Method",
      storedPathUpToTheMisspelledName: "sections/method",
      wholePathAsStored: "sections/method/setup.tex",
    });
  });

  it("finds a symlink's own name, not its target's", async () => {
    await symlink("main.tex", join(repositoryDirectory, "link.tex"));
    expect(await findNameSpelledOtherwiseOnDisk(repositoryDirectory, "LINK.tex", nothingTracked)).toEqual({
      requestedPathUpToTheMisspelledName: "LINK.tex",
      storedPathUpToTheMisspelledName: "link.tex",
      wholePathAsStored: "link.tex",
    });
  });

  it("lets through a spelling Git tracks, and checks the names below it", async () => {
    const trackedAsSections = (prefix: string) => Promise.resolve(prefix === "Sections");
    expect(
      await findNameSpelledOtherwiseOnDisk(
        repositoryDirectory,
        "Sections/method/setup.tex",
        trackedAsSections,
      ),
    ).toBeUndefined();
    expect(
      await findNameSpelledOtherwiseOnDisk(
        repositoryDirectory,
        "Sections/Method/setup.tex",
        trackedAsSections,
      ),
    ).toEqual({
      requestedPathUpToTheMisspelledName: "Sections/Method",
      storedPathUpToTheMisspelledName: "Sections/method",
      wholePathAsStored: "Sections/method/setup.tex",
    });
  });
});
