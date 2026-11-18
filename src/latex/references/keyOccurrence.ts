import type { SourceLocation } from "../source/scannedSource.js";

/** One use or definition of a label or citation key. */
export interface KeyOccurrence {
  readonly key: string;
  /** The command as written, without the backslash, e.g. eqref or citep. */
  readonly command: string;
  readonly location: SourceLocation;
}

/**
 * Splits a written argument into keys. A key built from a macro argument (`#1`) or another
 * command is skipped: it names nothing until TeX expands it.
 */
export function splitKeys(writtenArgument: string, allowsList: boolean): string[] {
  const parts = allowsList ? writtenArgument.split(",") : [writtenArgument];
  return parts
    .map((part) => part.trim())
    .filter((key) => key !== "" && !key.includes("#") && !key.includes("\\"));
}
