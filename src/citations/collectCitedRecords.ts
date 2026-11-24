import { chooseBibliographyReadingRules } from "../latex/bibliography/chooseBibliographyReadingRules.js";
import { readBibliographyFiles } from "../latex/bibliography/readBibliographyFiles.js";
import { type ProjectSourceReader, walkIncludedFiles } from "../latex/includes/walkIncludedFiles.js";
import { findCitations } from "../latex/references/findCitations.js";
import { locateBibliographyFiles } from "../latex/references/locateBibliographyFiles.js";
import { type BibliographyRecord, parseBibliographyRecords } from "./parseBibliographyRecords.js";

/**
 * The bibliography entries a document actually cites, in the order it first cites them.
 * Entries nobody cites do not reach the reader, so they are not worth a lookup.
 */

export interface CitedBibliography {
  readonly bibliographyFiles: string[];
  /** Cited entries in first-citation order, or every entry when the document has \nocite{*}. */
  readonly records: BibliographyRecord[];
  /** Every entry in the bibliography files, cited or not, for a lookup by key. */
  readonly allRecords: BibliographyRecord[];
  /** Cited keys with no entry in any bibliography file; check_references reports these. */
  readonly keysWithoutEntries: string[];
  readonly citesEveryEntry: boolean;
}

export async function collectCitedRecords(
  reader: ProjectSourceReader,
  mainTexFile: string,
): Promise<CitedBibliography> {
  const { visited } = await walkIncludedFiles(reader, mainTexFile);
  const scans = visited.map(findCitations);
  const citedKeys = [...new Set(scans.flatMap((scan) => scan.citations.map((citation) => citation.key)))];
  const citesEveryEntry = scans.some((scan) => scan.citesEveryEntry);

  const { files } = locateBibliographyFiles(visited, reader.projectFiles);
  const records = parseBibliographyRecords(
    await readBibliographyFiles(reader, files),
    chooseBibliographyReadingRules(visited),
  );
  const recordsByKey = new Map<string, BibliographyRecord>();
  for (const record of records) {
    if (!recordsByKey.has(record.key)) recordsByKey.set(record.key, record);
  }

  const citedRecords = citedKeys.flatMap((key) => {
    const record = recordsByKey.get(key);
    return record ? [record] : [];
  });
  const uncitedRecords = citesEveryEntry
    ? [...recordsByKey.values()].filter((record) => !citedKeys.includes(record.key))
    : [];
  return {
    bibliographyFiles: files,
    records: [...citedRecords, ...uncitedRecords],
    allRecords: [...recordsByKey.values()],
    keysWithoutEntries: citedKeys.filter((key) => !recordsByKey.has(key)),
    citesEveryEntry,
  };
}
