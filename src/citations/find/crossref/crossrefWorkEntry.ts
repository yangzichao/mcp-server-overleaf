import { firstString } from "../../metadataServices/metadataServices.js";
import { type BibtexEntryDraft, type BibtexFieldName, createBibtexDraft } from "../bibtex/bibtexEntry.js";
import { crossrefNameList } from "./crossrefPeople.js";

/**
 * A work from Crossref's REST API (`message.items` of a `/works` search) as a BibTeX entry.
 * Crossref's `type` picks the entry type, and with it the field the container goes in: an
 * article's journal, a paper's proceedings or a chapter's book. Crossref types with no BibTeX
 * counterpart become `@misc`.
 */

export interface CrossrefWork {
  readonly DOI?: unknown;
  readonly type?: unknown;
  readonly title?: unknown;
  readonly subtitle?: unknown;
  readonly author?: unknown;
  readonly editor?: unknown;
  readonly "container-title"?: unknown;
  readonly volume?: unknown;
  readonly issue?: unknown;
  readonly page?: unknown;
  readonly "article-number"?: unknown;
  readonly issued?: unknown;
  readonly published?: unknown;
  readonly publisher?: unknown;
  readonly "publisher-location"?: unknown;
  readonly ISBN?: unknown;
}

/** The fields `crossrefWorkEntry` reads, for a search to ask for and nothing more. */
export const CROSSREF_WORK_FIELDS = [
  "DOI",
  "type",
  "title",
  "subtitle",
  "author",
  "editor",
  "container-title",
  "volume",
  "issue",
  "page",
  "article-number",
  "issued",
  "published",
  "publisher",
  "publisher-location",
  "ISBN",
] as const satisfies ReadonlyArray<keyof CrossrefWork>;

interface EntryShape {
  readonly entryType: string;
  /** Where the journal, proceedings or book title goes. */
  readonly containerField?: BibtexFieldName;
  /** Where the publisher's name goes: a thesis names its school, a report its institution. */
  readonly publisherField: BibtexFieldName;
}

const ENTRY_SHAPES: Record<string, EntryShape> = {
  "journal-article": { entryType: "article", containerField: "journal", publisherField: "publisher" },
  "proceedings-article": {
    entryType: "inproceedings",
    containerField: "booktitle",
    publisherField: "publisher",
  },
  "book-chapter": { entryType: "incollection", containerField: "booktitle", publisherField: "publisher" },
  "book-section": { entryType: "incollection", containerField: "booktitle", publisherField: "publisher" },
  "book-part": { entryType: "incollection", containerField: "booktitle", publisherField: "publisher" },
  "reference-entry": { entryType: "incollection", containerField: "booktitle", publisherField: "publisher" },
  book: { entryType: "book", publisherField: "publisher" },
  monograph: { entryType: "book", publisherField: "publisher" },
  "edited-book": { entryType: "book", publisherField: "publisher" },
  "reference-book": { entryType: "book", publisherField: "publisher" },
  dissertation: { entryType: "phdthesis", publisherField: "school" },
  report: { entryType: "techreport", publisherField: "institution" },
};
/** Preprints, datasets and the rest: `howpublished` is the field every style prints for `@misc`. */
const MISC_SHAPE: EntryShape = { entryType: "misc", publisherField: "howpublished" };

function stringValue(value: unknown): string | undefined {
  const text = typeof value === "number" ? String(value) : firstString(value);
  return text === undefined || text.trim() === "" ? undefined : text;
}

/** Year and month from Crossref's `{"date-parts": [[2016, 6, 27]]}`. */
function dateParts(date: unknown): { year?: string; month?: string } {
  const parts = (date as { "date-parts"?: unknown[][] } | undefined)?.["date-parts"]?.[0];
  const [year, month] = Array.isArray(parts) ? parts : [];
  return {
    year: typeof year === "number" && Number.isInteger(year) ? String(year) : undefined,
    month: typeof month === "number" && Number.isInteger(month) ? String(month) : undefined,
  };
}

/**
 * A chapter or paper in a book series lists the series first and the book last, as Springer's
 * `["Lecture Notes in Computer Science", "Medical Image Computing and Computer-Assisted
 * Intervention – MICCAI 2015"]`.
 */
function bookAndSeries(containerTitles: unknown): { booktitle?: string; series?: string } {
  const titles = Array.isArray(containerTitles)
    ? containerTitles.filter((title): title is string => typeof title === "string" && title.trim() !== "")
    : [];
  if (titles.length < 2) return { booktitle: titles[0] };
  return { booktitle: titles[titles.length - 1], series: titles[0] };
}

/** `What is X?` and `A survey` join without a colon after the question mark. */
function fullTitle(work: CrossrefWork): string | undefined {
  const title = stringValue(work.title)?.trim();
  const subtitle = stringValue(work.subtitle)?.trim();
  if (title === undefined || subtitle === undefined) return title;
  return /[?!:.]$/.test(title) ? `${title} ${subtitle}` : `${title}: ${subtitle}`;
}

/** Undefined for a work without a DOI or a title, which a search answer cannot offer as a match. */
export function crossrefWorkEntry(work: CrossrefWork): BibtexEntryDraft | undefined {
  const doi = stringValue(work.DOI);
  const title = fullTitle(work);
  if (doi === undefined || title === undefined) return undefined;
  const shape = ENTRY_SHAPES[stringValue(work.type) ?? ""] ?? MISC_SHAPE;
  const issued = dateParts(work.issued);
  const date = issued.year === undefined ? dateParts(work.published) : issued;
  const fields: Partial<Record<BibtexFieldName, string>> = {
    author: crossrefNameList(work.author),
    editor: crossrefNameList(work.editor),
    title,
    volume: stringValue(work.volume),
    number: stringValue(work.issue),
    pages: stringValue(work.page) ?? stringValue(work["article-number"]),
    year: date.year,
    month: date.month,
    isbn: stringValue(work.ISBN),
    doi,
  };
  if (shape.containerField === "booktitle") Object.assign(fields, bookAndSeries(work["container-title"]));
  else if (shape.containerField) fields[shape.containerField] = stringValue(work["container-title"]);
  fields[shape.publisherField] = stringValue(work.publisher);
  if (shape.entryType === "book" || shape.entryType === "incollection") {
    fields.address = stringValue(work["publisher-location"]);
  }
  return createBibtexDraft(shape.entryType, fields);
}

/** The works of a `/works` search answer, best match first. */
export function readCrossrefSearchWorks(searchAnswer: string): CrossrefWork[] {
  const items = (JSON.parse(searchAnswer) as { message?: { items?: unknown } }).message?.items;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is CrossrefWork => typeof item === "object" && item !== null);
}
