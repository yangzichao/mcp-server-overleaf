import type { MissingProjectFile } from "../includes/walkIncludedFiles.js";
import type { SourceLocation } from "../source/scannedSource.js";

/** What `check_references` found. Problems first, then things worth a look that are not errors. */

export interface UndefinedKey {
  readonly key: string;
  /** The command at the first use, e.g. eqref or citep. */
  readonly command: string;
  readonly locations: SourceLocation[];
  /** A defined key that matches this one except for letter case, which is the usual typo. */
  readonly differsOnlyInCaseFrom: string | undefined;
}

export interface DuplicateKey {
  readonly key: string;
  readonly locations: SourceLocation[];
}

export interface ReferenceCheckReport {
  readonly mainTexFile: string;
  /** Every .tex file read, in document order, the main file first. */
  readonly checkedFiles: string[];
  readonly bibliographyFiles: string[];
  readonly hasThebibliography: boolean;

  readonly undefinedReferences: UndefinedKey[];
  readonly undefinedCitations: UndefinedKey[];
  readonly duplicateLabels: DuplicateKey[];
  readonly duplicateBibliographyKeys: DuplicateKey[];
  readonly missingFiles: MissingProjectFile[];

  readonly unusedLabels: string[];
  readonly unusedBibliographyEntries: string[];
  readonly citesEveryEntry: boolean;
  /** Set when a named bibliography file is missing, so no citation could be checked against it. */
  readonly citationsNotCheckedBecause: string | undefined;
  readonly pathsBuiltFromMacros: number;
  readonly texFilesNotIncluded: string[];
}

export function countReferenceProblems(report: ReferenceCheckReport): number {
  return (
    report.undefinedReferences.length +
    report.undefinedCitations.length +
    report.duplicateLabels.length +
    report.duplicateBibliographyKeys.length +
    report.missingFiles.length
  );
}
