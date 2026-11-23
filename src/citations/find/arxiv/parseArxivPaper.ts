import { decodeXmlText } from "../../metadataServices/parseArxivFeed.js";

/**
 * The first entry of an arXiv API answer, with what a reference needs. The API answers in
 * Atom: `<id>` is the abstract page of the version it answered for, `<published>` the date of
 * the first version, and `arxiv:doi` and `arxiv:journal_ref` what the authors added after
 * publication. A malformed id comes back as an entry titled "Error".
 */

export interface ArxivPaperRecord {
  /** As the abstract page names it, with a version, as `1706.03762v7`. */
  readonly versionedId: string;
  readonly title: string;
  /** In the order arXiv lists them, each as written, as `Ashish Vaswani`. */
  readonly authorNames: readonly string[];
  /** When the first version appeared, as `2017-06-12T17:57:34Z`. */
  readonly published: string | undefined;
  readonly primaryCategory: string | undefined;
  /** The published version's DOI, when the authors added one. */
  readonly doi: string | undefined;
  readonly journalReference: string | undefined;
}

export type ArxivFeedPaper =
  | { readonly kind: "paper"; readonly paper: ArxivPaperRecord }
  | { readonly kind: "error"; readonly summary: string }
  | { readonly kind: "none" };

function elementText(xml: string, elementName: string): string | undefined {
  const pattern = new RegExp(`<${elementName}\\b[^>]*>([\\s\\S]*?)</${elementName}>`);
  const text = pattern.exec(xml)?.[1];
  const decoded = text === undefined ? "" : decodeXmlText(text);
  return decoded === "" ? undefined : decoded;
}

function categoryTerm(entry: string): string | undefined {
  const term =
    /<arxiv:primary_category\b[^>]*\bterm="([^"]+)"/.exec(entry)?.[1] ??
    /<category\b[^>]*\bterm="([^"]+)"/.exec(entry)?.[1];
  return term === undefined ? undefined : decodeXmlText(term);
}

export function parseArxivPaper(atomFeed: string): ArxivFeedPaper {
  const entry = /<entry\b[^>]*>([\s\S]*?)<\/entry>/.exec(atomFeed)?.[1];
  if (entry === undefined) return { kind: "none" };
  const title = elementText(entry, "title");
  if (title === "Error") return { kind: "error", summary: elementText(entry, "summary") ?? "" };
  if (title === undefined) return { kind: "none" };
  const authorNames = [...entry.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/g)].flatMap((author) => {
    const name = elementText(author[1] ?? "", "name");
    return name === undefined ? [] : [name];
  });
  return {
    kind: "paper",
    paper: {
      versionedId: /arxiv\.org\/abs\/(\S+)$/i.exec(elementText(entry, "id") ?? "")?.[1] ?? "",
      title,
      authorNames,
      published: elementText(entry, "published"),
      primaryCategory: categoryTerm(entry),
      doi: elementText(entry, "arxiv:doi"),
      journalReference: elementText(entry, "arxiv:journal_ref"),
    },
  };
}
