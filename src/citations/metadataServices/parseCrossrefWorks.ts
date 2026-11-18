import { firstString, type SearchCandidate, titleForms } from "./metadataServices.js";

/**
 * The works in a Crossref `/works` search answer, as `message.items`. Each item's `author`
 * holds people as `family` (and `given`) and organisations as `name`; its year is the first
 * date part of `issued`, falling back to `published`.
 */

interface CrossrefAuthor {
  readonly family?: unknown;
  readonly name?: unknown;
}

interface CrossrefWork {
  readonly DOI?: unknown;
  readonly title?: unknown;
  readonly subtitle?: unknown;
  readonly author?: unknown;
  readonly issued?: unknown;
  readonly published?: unknown;
}

function readAuthorNames(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors.flatMap((author: CrossrefAuthor) => {
    const name = typeof author?.family === "string" ? author.family : author?.name;
    return typeof name === "string" && name.trim() !== "" ? [name.trim()] : [];
  });
}

function readYear(date: unknown): number | undefined {
  const year = (date as { "date-parts"?: unknown[][] } | undefined)?.["date-parts"]?.[0]?.[0];
  return typeof year === "number" && Number.isInteger(year) ? year : undefined;
}

export function parseCrossrefSearchCandidates(body: string): SearchCandidate[] {
  const items = (JSON.parse(body) as { message?: { items?: unknown[] } }).message?.items ?? [];
  return items.flatMap((item) => {
    const work = item as CrossrefWork;
    const titles = titleForms(firstString(work.title), firstString(work.subtitle));
    if (typeof work.DOI !== "string" || titles.length === 0) return [];
    return [
      {
        doi: work.DOI,
        titles,
        authorNames: readAuthorNames(work.author),
        year: readYear(work.issued) ?? readYear(work.published),
      },
    ];
  });
}
