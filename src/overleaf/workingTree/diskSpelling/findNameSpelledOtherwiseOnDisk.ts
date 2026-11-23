import type { BigIntStats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

import { isNothingAtPathError } from "../isNothingAtPathError.js";

/** The first name in a client path that reaches an entry the disk stores under another spelling. */
export interface NameSpelledOtherwiseOnDisk {
  /** The client's path up to and including that name, in Git's form. */
  readonly requestedPath: string;
  /** The same names as the disk stores them. */
  readonly storedPath: string;
  /** The client's whole path with the stored spellings in place. */
  readonly wholePathAsStored: string;
}

/**
 * Walks `gitPath` down from the clone's root, looking for a name that reaches an existing entry
 * although its folder does not list that spelling. Only a disk that ignores case does that, as
 * macOS does by default: there Main.tex opens main.tex, while Overleaf keeps them apart. A
 * difference in Unicode normalization alone is not counted, since the two spellings look the same.
 *
 * `isTrackedUnderThatSpelling` lets through a spelling Git has. When a collaborator renames a
 * folder to another case while the clone has a new file in it, the disk keeps the old spelling,
 * Git has the new one, and both reach the same folder.
 */
export async function findNameSpelledOtherwiseOnDisk(
  repositoryDirectory: string,
  gitPath: string,
  isTrackedUnderThatSpelling: (gitPathPrefix: string) => Promise<boolean>,
): Promise<NameSpelledOtherwiseOnDisk | undefined> {
  const names = gitPath.split("/");
  const storedNames: string[] = [];
  let directory = repositoryDirectory;
  for (const [index, name] of names.entries()) {
    const listing = await listDirectory(directory);
    if (listing === undefined) return undefined;
    const listedName = listing.find((entry) => entry.normalize("NFC") === name.normalize("NFC"));
    if (listedName === undefined) {
      const entry = await lstatIfPresent(join(directory, name));
      if (entry === undefined) return undefined;
      const requestedPath = names.slice(0, index + 1).join("/");
      if (!(await isTrackedUnderThatSpelling(requestedPath))) {
        const stored = [...storedNames, (await findListedNameOf(directory, listing, name, entry)) ?? name];
        return {
          requestedPath,
          storedPath: stored.join("/"),
          wholePathAsStored: [...stored, ...names.slice(index + 1)].join("/"),
        };
      }
    }
    storedNames.push(listedName ?? name);
    directory = join(directory, name);
  }
  return undefined;
}

/** The names in a folder, or undefined when the path is missing or is a file, so nothing is below it. */
async function listDirectory(directory: string): Promise<string[] | undefined> {
  try {
    return await readdir(directory);
  } catch (error) {
    if (isNothingAtPathError(error)) return undefined;
    throw error;
  }
}

async function lstatIfPresent(path: string): Promise<BigIntStats | undefined> {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if (isNothingAtPathError(error)) return undefined;
    throw error;
  }
}

/**
 * The listed name of the entry `name` reached, matched by device and inode rather than by
 * folding case, since a disk's case folding is its own. Names equal to `name` in lower case are
 * tried first; one of them is almost always it.
 */
async function findListedNameOf(
  directory: string,
  listing: readonly string[],
  name: string,
  entry: BigIntStats,
): Promise<string | undefined> {
  const folded = name.normalize("NFC").toLowerCase();
  const likely = listing.filter((candidate) => candidate.normalize("NFC").toLowerCase() === folded);
  const others = listing.filter((candidate) => !likely.includes(candidate));
  for (const candidate of [...likely, ...others]) {
    const candidateEntry = await lstatIfPresent(join(directory, candidate));
    if (candidateEntry?.dev === entry.dev && candidateEntry.ino === entry.ino) return candidate;
  }
  return undefined;
}
