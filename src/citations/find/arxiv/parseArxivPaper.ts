import { decodeXmlText } from "../../metadataServices/parseArxivFeed.js";
import { findAllXmlElements, findXmlElement } from "./findXmlElement.js";

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
  const content = findXmlElement(xml, elementName)?.content;
  const decoded = content === undefined ? "" : decodeXmlText(content);
  return decoded === "" ? undefined : decoded;
}

function categoryTerm(entry: string): string | undefined {
  const term =
    /<arxiv:primary_category\b[^<>]*\bterm="([^"]+)"/.exec(entry)?.[1] ??
    /<category\b[^<>]*\bterm="([^"]+)"/.exec(entry)?.[1];
  return term === undefined ? undefined : decodeXmlText(term);
}

/** The abstract page's address ends in the versioned id, after `arxiv.org/abs/`. */
function versionedIdFrom(abstractPage: string): string {
  const lastWord = abstractPage.split(/\s/).at(-1) ?? "";
  const marker = /arxiv\.org\/abs\//i.exec(lastWord);
  return marker ? lastWord.slice(marker.index + marker[0].length) : "";
}

export function parseArxivPaper(atomFeed: string): ArxivFeedPaper {
  const entry = findXmlElement(atomFeed, "entry")?.content;
  if (entry === undefined) return { kind: "none" };
  const title = elementText(entry, "title");
  if (title === "Error") return { kind: "error", summary: elementText(entry, "summary") ?? "" };
  if (title === undefined) return { kind: "none" };
  const authorNames = findAllXmlElements(entry, "author").flatMap((author) => {
    const name = elementText(author, "name");
    return name === undefined ? [] : [name];
  });
  return {
    kind: "paper",
    paper: {
      versionedId: versionedIdFrom(elementText(entry, "id") ?? ""),
      title,
      authorNames,
      published: elementText(entry, "published"),
      primaryCategory: categoryTerm(entry),
      doi: elementText(entry, "arxiv:doi"),
      journalReference: elementText(entry, "arxiv:journal_ref"),
    },
  };
}
