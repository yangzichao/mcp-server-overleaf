export interface FoundXmlElement {
  /** Between the opening and the closing tag, as written. */
  readonly content: string;
  /** Where the text after the closing tag starts. */
  readonly end: number;
}

/**
 * The first `<name …>…</name>` from `from` on, for a name such as `title` or `arxiv:doi`. XML
 * allows no `<` inside a tag, and when no closing tag follows the first opening one, none
 * follows a later one either, so a search reads the text once.
 */
export function findXmlElement(xml: string, elementName: string, from = 0): FoundXmlElement | undefined {
  const openingTag = new RegExp(`<${elementName}\\b[^<>]*>`, "g");
  openingTag.lastIndex = from;
  const opening = openingTag.exec(xml);
  if (!opening) return undefined;
  const contentStart = opening.index + opening[0].length;
  const closingTag = `</${elementName}>`;
  const contentEnd = xml.indexOf(closingTag, contentStart);
  if (contentEnd === -1) return undefined;
  return { content: xml.slice(contentStart, contentEnd), end: contentEnd + closingTag.length };
}

/** The content of each `<name …>…</name>` in turn, each search starting after the last element. */
export function findAllXmlElements(xml: string, elementName: string): string[] {
  const contents: string[] = [];
  let found = findXmlElement(xml, elementName);
  while (found) {
    contents.push(found.content);
    found = findXmlElement(xml, elementName, found.end);
  }
  return contents;
}
