import { findNameSpelledOtherwiseOnDisk } from "./findNameSpelledOtherwiseOnDisk.js";

/** A client path that reaches an existing file or folder only because the disk ignores case. */
export class NameSpelledOtherwiseOnDiskError extends Error {}

/**
 * Refuses a path whose spelling differs only in case from what the clone holds. On a disk that
 * ignores case, deleting Main.tex would delete main.tex, and writing it would overwrite main.tex,
 * under replies naming Main.tex.
 */
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
    `${misspelled.requestedPath} is not in the project, but ${misspelled.storedPath} is, ` +
      "and this computer's disk does not tell names that differ only in case apart. " +
      `Use ${misspelled.wholePathAsStored}, or choose a name that differs in more than case.`,
  );
}
