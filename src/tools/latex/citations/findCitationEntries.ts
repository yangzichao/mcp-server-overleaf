import { findCitations } from "../../../citations/find/findCitations.js";
import { createPublicCitationSources } from "../../../citations/find/sources/publicCitationSources.js";
import {
  type BibliographyRecord,
  parseBibliographyRecords,
} from "../../../citations/parseBibliographyRecords.js";
import type { CitationLookupEndpoints } from "../../../config/citationLookupConfiguration.js";
import { UNKNOWN_PROGRAM_READING_RULES } from "../../../latex/bibliography/bibliographyReadingRules.js";
import { readBibliographyFiles } from "../../../latex/bibliography/readBibliographyFiles.js";
import type { ProjectSourceReader } from "../../../latex/includes/walkIncludedFiles.js";
import { type CitationLookupDeadline, stopLookupsAtDeadline } from "./citationLookupDeadline.js";
import { describeFoundCitations } from "./describeFoundCitations.js";

export interface ProjectBibliography {
  readonly files: readonly string[];
  readonly entries: readonly BibliographyRecord[];
}

/** Every entry in every .bib file, cited or not: a new key must not collide with any of them. */
export async function readProjectBibliography(reader: ProjectSourceReader): Promise<ProjectBibliography> {
  const files = [...reader.projectFiles].filter((path) => /\.bib$/i.test(path)).sort();
  const entries = parseBibliographyRecords(
    await readBibliographyFiles(reader, files),
    UNKNOWN_PROGRAM_READING_RULES,
  );
  return { files, entries };
}

/** look_up_citations (action find): BibTeX for each query, with keys the project does not use yet. */
export async function findCitationEntries(
  bibliography: ProjectBibliography,
  queries: readonly string[],
  endpoints: CitationLookupEndpoints,
  deadline: CitationLookupDeadline,
): Promise<string> {
  const sources = stopLookupsAtDeadline(createPublicCitationSources(endpoints), deadline);
  const results = await findCitations(queries, sources, { existingEntries: bibliography.entries });
  return describeFoundCitations(results, bibliography.files);
}
