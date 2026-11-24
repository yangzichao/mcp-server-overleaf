import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAXIMUM_FOLDER_FILES,
  readLocalFolder,
} from "../../../../src/tools/editing/folderUpload/readLocalFolder.js";

describe("reading a folder from this computer for upload_folder", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "folder-upload-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  async function writeFiles(folder: string, files: Record<string, string>): Promise<void> {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(folder, ...path.split("/").slice(0, -1)), { recursive: true });
      await writeFile(join(folder, ...path.split("/")), content);
    }
  }

  it("lists every file below the folder by its / path, in order, without reading it", async () => {
    const folder = join(scratch, "paper");
    await writeFiles(folder, {
      "main.tex": "\\documentclass{article}\n",
      "figures/plot.png": "png",
      "figures/raw/data.csv": "1,2\n",
      "appendix.tex": "A",
    });
    const listing = await readLocalFolder(folder);
    expect(listing.folderPath).toBe(folder);
    expect(listing.files.map((file) => [file.relativePath, file.size])).toEqual([
      ["appendix.tex", 1],
      ["figures/plot.png", 3],
      ["figures/raw/data.csv", 4],
      ["main.tex", 24],
    ]);
    expect(listing.files[1]?.absolutePath).toBe(join(folder, "figures", "plot.png"));
    expect(listing.skipped).toEqual([]);
  });

  it("leaves out hidden entries and symbolic links, and says so", async () => {
    const folder = join(scratch, "paper");
    await writeFiles(folder, {
      "main.tex": "x",
      ".env": "SECRET=1",
      ".git/config": "[core]",
      "figures/.DS_Store": "",
    });
    await symlink(join(scratch, "elsewhere"), join(folder, "outside"));
    const listing = await readLocalFolder(folder);
    expect(listing.files.map((file) => file.relativePath)).toEqual(["main.tex"]);
    expect(listing.skipped).toEqual([
      { relativePath: ".env", reason: "hidden" },
      { relativePath: ".git", reason: "hidden" },
      { relativePath: "figures/.DS_Store", reason: "hidden" },
      { relativePath: "outside", reason: "a symbolic link" },
    ]);
  });

  it("refuses a relative path, a hidden path, a file and a missing folder", async () => {
    await writeFiles(scratch, { "notes.txt": "x", ".config/paper/main.tex": "x" });
    await expect(readLocalFolder("paper")).rejects.toThrow("must be an absolute path to a folder");
    await expect(readLocalFolder(join(scratch, ".config", "paper"))).rejects.toThrow("hidden path (.config)");
    await expect(readLocalFolder(join(scratch, "notes.txt"))).rejects.toThrow("is not a folder");
    await expect(readLocalFolder(join(scratch, "missing"))).rejects.toThrow("is not a folder");
  });

  it("refuses a folder with nothing to copy", async () => {
    const folder = join(scratch, "empty");
    await writeFiles(folder, { ".DS_Store": "", "sub/.hidden": "" });
    await expect(readLocalFolder(folder)).rejects.toThrow("holds no file that would be copied");
  });

  it("refuses more files than Overleaf's upload dialog takes", async () => {
    const folder = join(scratch, "many");
    const files = Object.fromEntries(
      Array.from({ length: MAXIMUM_FOLDER_FILES + 1 }, (_, index) => [`file-${index}.txt`, "x"]),
    );
    await writeFiles(folder, files);
    await expect(readLocalFolder(folder)).rejects.toThrow(`more than ${MAXIMUM_FOLDER_FILES} files`);
    await rm(join(folder, "file-0.txt"));
    expect((await readLocalFolder(folder)).files).toHaveLength(MAXIMUM_FOLDER_FILES);
  });

  it("stops looking through a huge folder early, hidden entries included", async () => {
    const folder = join(scratch, "huge");
    await writeFiles(folder, { "main.tex": "x" });
    await writeFiles(
      folder,
      Object.fromEntries(Array.from({ length: 2_000 }, (_, index) => [`.cache-${index}`, ""])),
    );
    await expect(readLocalFolder(folder)).rejects.toThrow("more than 2000 files and folders");
  });

  it("refuses a file larger than Overleaf accepts", async () => {
    const folder = join(scratch, "large");
    await writeFiles(folder, { "main.tex": "x", "video.mp4": "" });
    await truncate(join(folder, "video.mp4"), 50 * 1024 * 1024 + 1);
    await expect(readLocalFolder(folder)).rejects.toThrow(
      "more than the 50 MB Overleaf accepts for one file",
    );
  });
});
