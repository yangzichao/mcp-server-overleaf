import { findArxivId, findDoi } from "../citationIdentifiers.js";
import type { BibliographyRecord } from "../parseBibliographyRecords.js";
import { type BibtexEntryDraft, findMissingFields, formatBibtexEntry } from "./bibtex/bibtexEntry.js";
import { CitationKeyRegistry } from "./keys/citationKeyRegistry.js";
import { citationKeyStem } from "./keys/citationKeyStem.js";

/** One work, written as a BibTeX entry ready to add to a .bib file. */
export interface FoundCitation {
  readonly key: string;
  readonly bibtex: string;
  readonly entryType: string;
  /** As written in the entry, so with LaTeX markup and braces that keep capitals. */
  readonly title: string | undefined;
  readonly year: string | undefined;
  readonly doi: string | undefined;
  readonly arxivId: string | undefined;
  /** Among author (or editor), title and year, those the source did not give. */
  readonly missingFields: readonly string[];
  /** The key of an entry already in the bibliography with the same DOI or arXiv id. */
  readonly existingKey: string | undefined;
}

function withoutArxivVersion(arxivId: string): string {
  return arxivId.replace(/v\d+$/i, "").toLowerCase();
}

/**
 * Chooses keys for new entries: never one the bibliography already has, nor one given to an
 * earlier entry, and points out a work the bibliography already holds under another key.
 */
export class CitationWriter {
  private readonly registry: CitationKeyRegistry;
  private readonly keysByDoi = new Map<string, string>();
  private readonly keysByArxivId = new Map<string, string>();

  constructor(existingEntries: readonly BibliographyRecord[], takenKeys: Iterable<string>) {
    this.registry = new CitationKeyRegistry([...takenKeys, ...existingEntries.map((entry) => entry.key)]);
    for (const entry of existingEntries) {
      const doi = findDoi(entry)?.toLowerCase();
      const arxivId = findArxivId(entry);
      if (doi && !this.keysByDoi.has(doi)) this.keysByDoi.set(doi, entry.key);
      if (arxivId && !this.keysByArxivId.has(withoutArxivVersion(arxivId))) {
        this.keysByArxivId.set(withoutArxivVersion(arxivId), entry.key);
      }
    }
  }

  /** The entry for a work that will be added: its key is taken from then on. */
  chosen(draft: BibtexEntryDraft): FoundCitation {
    const citation = this.write(draft);
    this.registry.reserve(citation.key);
    return citation;
  }

  /** One of several works offered for a choice: its key stays free, as at most one is added. */
  offered(draft: BibtexEntryDraft): FoundCitation {
    return this.write(draft);
  }

  private write(draft: BibtexEntryDraft): FoundCitation {
    const key = this.registry.firstFreeKey(citationKeyStem(draft));
    const doi = draft.fields.get("doi");
    const arxivId = draft.fields.get("archivePrefix") === "arXiv" ? draft.fields.get("eprint") : undefined;
    return {
      key,
      bibtex: formatBibtexEntry({ ...draft, key }),
      entryType: draft.entryType,
      title: draft.fields.get("title"),
      year: draft.fields.get("year"),
      doi,
      arxivId,
      missingFields: findMissingFields(draft),
      existingKey:
        (doi === undefined ? undefined : this.keysByDoi.get(doi.toLowerCase())) ??
        (arxivId === undefined ? undefined : this.keysByArxivId.get(withoutArxivVersion(arxivId))),
    };
  }
}
