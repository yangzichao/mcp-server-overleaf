import { findXmlElement } from "./findXmlElement.js";

/**
 * The title of the first entry in an arXiv API answer. The API answers in Atom, errors
 * included: a malformed id comes back as an entry titled "Error".
 */

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const XML_REFERENCE = /&(?:(amp|lt|gt|quot|apos)|#([0-9]{1,8})|#x([0-9A-Fa-f]{1,8}));/g;
const LARGEST_CODE_POINT = 0x10ffff;

function decodeXmlReference(
  written: string,
  entityName: string | undefined,
  decimalCode: string | undefined,
  hexadecimalCode: string | undefined,
): string {
  if (entityName !== undefined) return XML_ENTITIES[entityName] ?? written;
  const code = decimalCode !== undefined ? Number(decimalCode) : Number.parseInt(hexadecimalCode ?? "", 16);
  // String.fromCodePoint throws past U+10FFFF, so such a reference stays as written.
  return code <= LARGEST_CODE_POINT ? String.fromCodePoint(code) : written;
}

/**
 * Decodes every reference in one pass, so "&amp;#65;" becomes the text "&#65;" instead of
 * being decoded a second time into "A".
 */
export function decodeXmlText(text: string): string {
  return text.replace(XML_REFERENCE, decodeXmlReference).replace(/\s+/g, " ").trim();
}

export type ArxivFeedEntry =
  | { readonly kind: "article"; readonly title: string }
  | { readonly kind: "error"; readonly summary: string }
  | { readonly kind: "none" };

export function parseFirstArxivEntry(atomFeed: string): ArxivFeedEntry {
  const entry = findXmlElement(atomFeed, "entry")?.content;
  if (entry === undefined) return { kind: "none" };
  const title = decodeXmlText(findXmlElement(entry, "title")?.content ?? "");
  if (title === "Error") {
    return { kind: "error", summary: decodeXmlText(findXmlElement(entry, "summary")?.content ?? "") };
  }
  return title === "" ? { kind: "none" } : { kind: "article", title };
}
