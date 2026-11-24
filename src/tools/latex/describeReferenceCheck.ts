import type { MissingProjectFile } from "../../latex/includes/walkIncludedFiles.js";
import {
  countReferenceProblems,
  type DuplicateKey,
  type ReferenceCheckReport,
  type UndefinedKey,
} from "../../latex/references/referenceCheckReport.js";
import { describeLocation, type SourceLocation } from "../../latex/source/scannedSource.js";

/**
 * The reply `check_references` gives: a verdict line, each kind of problem with the file
 * and line to fix, then what is worth a look but not wrong.
 */

const MAXIMUM_ITEMS_PER_LIST = 30;
const MAXIMUM_LOCATIONS_PER_ITEM = 3;
const MAXIMUM_NAMES_IN_A_NOTE = 20;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function listNames(names: readonly string[]): string {
  const shown = names.slice(0, MAXIMUM_NAMES_IN_A_NOTE).join(", ");
  return names.length > MAXIMUM_NAMES_IN_A_NOTE
    ? `${shown}, and ${names.length - MAXIMUM_NAMES_IN_A_NOTE} more`
    : shown;
}

function describeLocations(locations: readonly SourceLocation[]): string {
  const shown = locations.slice(0, MAXIMUM_LOCATIONS_PER_ITEM).map(describeLocation);
  const hidden = locations.length - shown.length;
  return hidden > 0 ? `${shown.join(", ")} and ${hidden} more` : shown.join(" and ");
}

function section(heading: string, items: readonly string[]): string[] {
  if (items.length === 0) return [];
  const shown = items.slice(0, MAXIMUM_ITEMS_PER_LIST).map((item) => `  ${item}`);
  if (items.length > shown.length) shown.push(`  … and ${items.length - shown.length} more`);
  return ["", `${heading} (${items.length}):`, ...shown];
}

function describeUndefined(undefinedKey: UndefinedKey): string {
  const caseHint = undefinedKey.differsOnlyInCaseFrom
    ? `; ${undefinedKey.differsOnlyInCaseFrom} exists, which differs only in letter case`
    : "";
  return `${undefinedKey.key}  \\${undefinedKey.command} at ${describeLocations(undefinedKey.locations)}${caseHint}`;
}

function describeDuplicate(duplicate: DuplicateKey): string {
  return `${duplicate.key}  at ${describeLocations(duplicate.locations)}`;
}

function describeMissing(missing: MissingProjectFile): string {
  const tried = missing.tried.slice(0, MAXIMUM_LOCATIONS_PER_ITEM).join(", ");
  const more =
    missing.tried.length > MAXIMUM_LOCATIONS_PER_ITEM
      ? ` and ${missing.tried.length - MAXIMUM_LOCATIONS_PER_ITEM} more`
      : "";
  return `${missing.written}  at ${describeLocation(missing.location)}; looked for ${tried}${more}`;
}

function describeScope(report: ReferenceCheckReport): string {
  const included = report.checkedFiles.length - 1;
  const files = included > 0 ? ` and ${plural(included, "file")} it includes` : "";
  let bibliography = " with no bibliography";
  if (report.bibliographyFiles.length > 0) bibliography = ` with ${report.bibliographyFiles.join(", ")}`;
  else if (report.hasThebibliography) bibliography = " with its thebibliography list";
  return `Checked ${report.mainTexFile}${files}${bibliography}`;
}

function describeNotes(report: ReferenceCheckReport): string[] {
  const notes: string[] = [];
  if (report.citationsNotCheckedBecause) {
    notes.push(`Citations were not checked: ${report.citationsNotCheckedBecause}.`);
  }
  if (report.unusedLabels.length > 0) {
    notes.push(
      `${plural(report.unusedLabels.length, "label is", "labels are")} never referenced: ${listNames(report.unusedLabels)}`,
    );
  }
  if (report.citesEveryEntry) {
    notes.push("\\nocite{*} cites every bibliography entry, so unused entries were not looked for.");
  } else if (report.unusedBibliographyEntries.length > 0) {
    notes.push(
      `${plural(report.unusedBibliographyEntries.length, "bibliography entry is", "bibliography entries are")} never cited: ${listNames(report.unusedBibliographyEntries)}`,
    );
  }
  if (report.pathsBuiltFromMacros > 0) {
    notes.push(
      `${plural(report.pathsBuiltFromMacros, "file path is", "file paths are")} built from macros and could not be checked.`,
    );
  }
  if (report.texFilesNotIncluded.length > 0) {
    const count = report.texFilesNotIncluded.length;
    notes.push(
      `${plural(count, "other .tex file")}, not included from ${report.mainTexFile}, ${count === 1 ? "was" : "were"} not checked: ${listNames(report.texFilesNotIncluded)}`,
    );
  }
  return notes.length === 0 ? [] : ["", "Worth a look, not errors:", ...notes.map((note) => `  ${note}`)];
}

export function describeReferenceCheck(report: ReferenceCheckReport): string {
  const problems = countReferenceProblems(report);
  const verdict = problems === 0 ? "no problems found." : `${plural(problems, "problem")}:`;
  const noBibliographyHint =
    report.bibliographyFiles.length === 0 && !report.hasThebibliography
      ? " (the document names no bibliography file)"
      : "";

  return [
    `${describeScope(report)}: ${verdict}`,
    ...section(
      "Undefined references, shown as ?? in the PDF",
      report.undefinedReferences.map(describeUndefined),
    ),
    ...section(`Undefined citations${noBibliographyHint}`, report.undefinedCitations.map(describeUndefined)),
    ...section("Labels defined more than once", report.duplicateLabels.map(describeDuplicate)),
    ...section(
      "Bibliography keys defined more than once",
      report.duplicateBibliographyKeys.map(describeDuplicate),
    ),
    ...section("Missing files", report.missingFiles.map(describeMissing)),
    ...describeNotes(report),
  ].join("\n");
}
