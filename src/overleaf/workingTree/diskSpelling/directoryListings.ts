import type { BigIntStats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

import { isNothingAtPathError } from "../isNothingAtPathError.js";

export async function listDirectory(directory: string): Promise<string[] | undefined> {
  try {
    return await readdir(directory);
  } catch (error) {
    if (isNothingAtPathError(error)) return undefined;
    throw error;
  }
}

export async function lstatIfPresent(path: string): Promise<BigIntStats | undefined> {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if (isNothingAtPathError(error)) return undefined;
    throw error;
  }
}

/**
 * The listed name of the entry `name` reached, matched by device and inode rather than by
 * folding case, since a disk's case folding is its own.
 */
export async function findListedNameOf(
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
