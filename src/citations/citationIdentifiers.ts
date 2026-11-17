import type { BibliographyRecord } from "./parseBibliographyRecords.js";

/**
 * The identifiers an entry can be looked up by. A DOI is the strongest: it names exactly one
 * work. An arXiv id is next. Without either, only the title is left to search for.
 */

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
const DOI_IN_URL_PATTERN = /^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/\S+)$/i;
const NEW_ARXIV_ID = /^\d{4}\.\d{4,5}(?:v\d+)?$/;
const OLD_ARXIV_ID = /^[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?$/;
const ARXIV_IN_URL_PATTERN = /arxiv\.org\/(?:abs|pdf)\/([^\s?#]+?)(?:\.pdf)?\/?$/i;
const ARXIV_IN_TEXT_PATTERN = /arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/i;

function stripBraces(value: string): string {
  return value.replace(/[{}]/g, "").trim();
}

export function findDoi(record: BibliographyRecord): string | undefined {
  const written = stripBraces(record.fields.get("doi") ?? "")
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  if (DOI_PATTERN.test(written)) return written;
  const fromUrl = DOI_IN_URL_PATTERN.exec(stripBraces(record.fields.get("url") ?? ""))?.[1];
  return fromUrl && DOI_PATTERN.test(fromUrl) ? fromUrl : undefined;
}

function isArxivId(candidate: string): boolean {
  return NEW_ARXIV_ID.test(candidate) || OLD_ARXIV_ID.test(candidate);
}

export function findArxivId(record: BibliographyRecord): string | undefined {
  const archive = stripBraces(record.fields.get("archiveprefix") ?? record.fields.get("eprinttype") ?? "");
  const eprint = stripBraces(record.fields.get("eprint") ?? "").replace(/^arXiv:/i, "");
  if (archive.toLowerCase() === "arxiv" && isArxivId(eprint)) return eprint;

  const fromUrl = ARXIV_IN_URL_PATTERN.exec(stripBraces(record.fields.get("url") ?? ""))?.[1];
  if (fromUrl && isArxivId(fromUrl)) return fromUrl;

  for (const field of ["journal", "note", "howpublished"]) {
    const fromText = ARXIV_IN_TEXT_PATTERN.exec(record.fields.get(field) ?? "")?.[1];
    if (fromText) return fromText;
  }
  return undefined;
}

/** The first author's family name, which sharpens a title search considerably. */
export function findFirstAuthorFamilyName(record: BibliographyRecord): string | undefined {
  const firstAuthor = (record.fields.get("author") ?? "").split(/\s+and\s+/i)[0]?.trim();
  if (!firstAuthor) return undefined;
  const familyName = firstAuthor.includes(",") ? firstAuthor.split(",")[0] : firstAuthor.split(/\s+/).pop();
  const cleaned = stripBraces(familyName ?? "");
  return cleaned === "" || cleaned.toLowerCase() === "others" ? undefined : cleaned;
}
