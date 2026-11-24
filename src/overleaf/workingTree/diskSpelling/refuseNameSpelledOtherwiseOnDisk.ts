import { findNameSpelledOtherwiseOnDisk } from "./findNameSpelledOtherwiseOnDisk.js";

export class NameSpelledOtherwiseOnDiskError extends Error {}

export async function refuseNameSpelledOtherwiseOnDisk(
  repositoryDirectory: string,
  gitPath: string,
  isTrackedUnderThatSpelling: (gitPathPrefix: string) => Promise<boolean>,
): Promise<void> {
  const misspelled = await findNameSpelledOtherwiseOnDisk(
    repositoryDirectory,
    gitPath,
    isTrackedUnderThatSpelling,
  );
  if (misspelled === undefined) return;
  throw new NameSpelledOtherwiseOnDiskError(
    `${misspelled.requestedPathUpToTheMisspelledName} is not in the project, but ${misspelled.storedPathUpToTheMisspelledName} is, ` +
      "and this computer's disk does not tell names that differ only in case apart. " +
      `Use ${misspelled.wholePathAsStored}, or choose a name that differs in more than case.`,
  );
}
