export interface FoundXmlElement {
  readonly content: string;
  readonly end: number;
}

export function findXmlElement(xml: string, elementName: string, from = 0): FoundXmlElement | undefined {
  // Not \b: "-", "." and ":" may continue an element name, so <title-group> would pass for <title>.
  const openingTag = new RegExp(`<${elementName}(?=[\\s/>])[^<>]*>`, "g");
  openingTag.lastIndex = from;
  const opening = openingTag.exec(xml);
  if (!opening) return undefined;
  const contentStart = opening.index + opening[0].length;
  const closingTag = `</${elementName}>`;
  const contentEnd = xml.indexOf(closingTag, contentStart);
  if (contentEnd === -1) return undefined;
  return { content: xml.slice(contentStart, contentEnd), end: contentEnd + closingTag.length };
}

export function findAllXmlElements(xml: string, elementName: string): string[] {
  const contents: string[] = [];
  let found = findXmlElement(xml, elementName);
  while (found) {
    contents.push(found.content);
    found = findXmlElement(xml, elementName, found.end);
  }
  return contents;
}
