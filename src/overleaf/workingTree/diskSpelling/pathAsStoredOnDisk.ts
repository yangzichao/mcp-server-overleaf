import { join } from "node:path";

import { findListedNameOf, listDirectory, lstatIfPresent } from "./directoryListings.js";

export async function pathAsStoredOnDisk(
  repositoryDirectory: string,
  gitPath: string,
): Promise<string | undefined> {
  const storedNames: string[] = [];
  let directory = repositoryDirectory;
  for (const name of gitPath.split("/")) {
    const listing = await listDirectory(directory);
    if (listing === undefined) return undefined;
    const storedName =
      listing.find((entry) => entry.normalize("NFC") === name.normalize("NFC")) ??
      (await findListedNameOfEntryReachedBy(directory, listing, name));
    if (storedName === undefined) return undefined;
    storedNames.push(storedName);
    directory = join(directory, storedName);
  }
  return storedNames.join("/");
}

async function findListedNameOfEntryReachedBy(
  directory: string,
  listing: readonly string[],
  name: string,
): Promise<string | undefined> {
  const entry = await lstatIfPresent(join(directory, name));
  return entry === undefined ? undefined : await findListedNameOf(directory, listing, name, entry);
}
