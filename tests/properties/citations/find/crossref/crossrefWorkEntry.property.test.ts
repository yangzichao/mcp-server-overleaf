import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findDoi } from "../../../../../src/citations/citationIdentifiers.js";
import { formatBibtexEntry } from "../../../../../src/citations/find/bibtex/bibtexEntry.js";
import {
  type CrossrefWork,
  crossrefWorkEntry,
} from "../../../../../src/citations/find/crossref/crossrefWorkEntry.js";
import { parseBibliographyRecords } from "../../../../../src/citations/parseBibliographyRecords.js";
import { BIBTEX_READING_RULES } from "../../../../../src/latex/bibliography/bibliographyReadingRules.js";

const ENTRY_TYPE_BY_CROSSREF_TYPE: Record<string, string> = {
  "journal-article": "article",
  "proceedings-article": "inproceedings",
  "book-chapter": "incollection",
  "book-section": "incollection",
  "book-part": "incollection",
  "reference-entry": "incollection",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  dissertation: "phdthesis",
  report: "techreport",
};

const crossrefType = fc.constantFrom(
  ...Object.keys(ENTRY_TYPE_BY_CROSSREF_TYPE),
  "posted-content",
  "dataset",
  "other",
  "",
);
const plainTitle = fc.constantFrom("Deep Residual Learning", "What is X?", "A survey", "Attention");
const containerTitles = fc.array(
  fc.constantFrom("Lecture Notes in Computer Science", "MICCAI 2015", "Nature", " "),
  {
    maxLength: 3,
  },
);
const doi = fc.stringMatching(/^10\.[0-9]{4,6}\/[a-z0-9.]{1,10}$/);

const work = fc.record(
  {
    DOI: fc.oneof(doi, fc.constantFrom("", " ")),
    type: crossrefType,
    title: fc.oneof(
      plainTitle.map((title) => [title]),
      plainTitle,
      fc.constant([]),
      fc.constant([" "]),
    ),
    subtitle: fc.oneof(
      plainTitle.map((title) => [title]),
      fc.constant([]),
    ),
    "container-title": containerTitles,
    publisher: fc.constantFrom("Springer", "IEEE", ""),
    "publisher-location": fc.constantFrom("Cham", "New York"),
    volume: fc.oneof(fc.constantFrom("12", ""), fc.integer({ min: 1, max: 99 })),
    issued: fc.integer({ min: 1950, max: 2030 }).map((year) => ({ "date-parts": [[year, 6]] })),
    author: fc.array(
      fc.record({ family: fc.constantFrom("He", "Zhang"), given: fc.constantFrom("Kaiming", "X.") }),
      { maxLength: 2 },
    ),
  },
  { requiredKeys: [] },
);

function hasText(value: unknown): boolean {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text.trim() !== "";
}

/** A journal takes the first container title; a book part takes the last as its book and the first as its series. */
function expectedContainerFields(entryType: string, containerTitles: readonly string[]) {
  const titles = containerTitles.filter((title) => title.trim() !== "");
  const journal = containerTitles[0]?.trim() ? containerTitles[0] : undefined;
  const isBookPart = entryType === "inproceedings" || entryType === "incollection";
  return {
    journal: entryType === "article" ? journal : undefined,
    booktitle: isBookPart ? titles.at(-1) : undefined,
    series: isBookPart && titles.length >= 2 ? titles[0] : undefined,
  };
}

describe("crossrefWorkEntry properties", () => {
  it("makes an entry exactly when the work has a DOI and a title, of the type its Crossref type maps to", () => {
    fc.assert(
      fc.property(work, (given) => {
        const entry = crossrefWorkEntry(given);
        if (!hasText(given.DOI) || !hasText(given.title)) {
          expect(entry).toBeUndefined();
          return;
        }
        expect(entry?.entryType).toBe(ENTRY_TYPE_BY_CROSSREF_TYPE[given.type ?? ""] ?? "misc");
        expect(entry?.fields.get("doi")).toBe(given.DOI);
      }),
    );
  });

  it("puts the container where the entry type wants it: a journal, or a book after its series", () => {
    fc.assert(
      fc.property(work, (given) => {
        const entry = crossrefWorkEntry(given);
        if (entry === undefined) return;
        expect({
          journal: entry.fields.get("journal"),
          booktitle: entry.fields.get("booktitle"),
          series: entry.fields.get("series"),
        }).toEqual(expectedContainerFields(entry.entryType, given["container-title"] ?? []));
      }),
    );
  });

  it("writes an entry the citation check reads back with the work's DOI", () => {
    fc.assert(
      fc.property(work, (given) => {
        const entry = crossrefWorkEntry(given);
        if (entry === undefined) return;
        const [record] = parseBibliographyRecords(
          [{ path: "refs.bib", text: `${formatBibtexEntry({ ...entry, key: "k" })}\n` }],
          BIBTEX_READING_RULES,
        );
        expect(record && findDoi(record)).toBe(given.DOI);
      }),
    );
  });

  it("never throws, whatever Crossref sends", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom(
            "DOI",
            "type",
            "title",
            "subtitle",
            "container-title",
            "issued",
            "published",
            "author",
            "page",
            "ISBN",
          ),
          fc.jsonValue({ maxDepth: 3 }),
          { maxKeys: 8 },
        ),
        (given) => {
          crossrefWorkEntry(given as CrossrefWork);
        },
      ),
    );
  });
});
