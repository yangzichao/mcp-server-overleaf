/**
 * The title of the first entry in an arXiv API answer. The API answers in Atom, errors
 * included: a malformed id comes back as an entry titled "Error".
 */

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlText(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => XML_ENTITIES[name] ?? "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export type ArxivFeedEntry =
  | { readonly kind: "article"; readonly title: string }
  | { readonly kind: "error"; readonly summary: string }
  | { readonly kind: "none" };

export function parseFirstArxivEntry(atomFeed: string): ArxivFeedEntry {
  const entry = /<entry\b[^>]*>([\s\S]*?)<\/entry>/.exec(atomFeed)?.[1];
  if (entry === undefined) return { kind: "none" };
  const title = decodeXmlText(/<title\b[^>]*>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? "");
  if (title === "Error") {
    return {
      kind: "error",
      summary: decodeXmlText(/<summary\b[^>]*>([\s\S]*?)<\/summary>/.exec(entry)?.[1] ?? ""),
    };
  }
  return title === "" ? { kind: "none" } : { kind: "article", title };
}
