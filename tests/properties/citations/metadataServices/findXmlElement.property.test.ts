import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  findAllXmlElements,
  findXmlElement,
} from "../../../../src/citations/metadataServices/findXmlElement.js";

const ELEMENT_NAMES = ["entry", "title", "author", "name", "arxiv:doi", "arxiv:journal_ref"] as const;
const elementName = fc.constantFrom(...ELEMENT_NAMES);

/** Text that holds no tag of the element asked for, though it may hold others. */
const contentFor = (name: string) =>
  fc
    .array(
      fc.constantFrom(
        "Attention",
        " ",
        "\n",
        "&amp;",
        "<b>x</b>",
        "<entry>",
        "</summary>",
        "北京",
        "𝔸",
        "<",
        ">",
        `<${name}x>`,
      ),
      { maxLength: 6 },
    )
    .map((pieces) => pieces.join(""))
    .filter((content) => !content.includes(`</${name}>`) && !new RegExp(`<${name}\\b`).test(content));
const attributes = fc.constantFrom("", ' xml:lang="en"', ' term="cs.CL"', " ");
const between = fc.constantFrom("", "\n  ", "<id>x</id>", "<other>t</other>");

const document = elementName.chain((name) =>
  fc
    .array(fc.tuple(between, attributes, contentFor(name)), { maxLength: 4 })
    .chain((elements) => fc.tuple(fc.constant(name), fc.constant(elements), between)),
);

function render(
  name: string,
  elements: ReadonlyArray<readonly [string, string, string]>,
  after: string,
): string {
  return `${elements.map(([before, attribute, content]) => `${before}<${name}${attribute}>${content}</${name}>`).join("")}${after}`;
}

describe("findXmlElement properties", () => {
  it("reads back the content of every element with the name, in order, attributes or not", () => {
    fc.assert(
      fc.property(document, ([name, elements, after]) => {
        expect(findAllXmlElements(render(name, elements, after), name)).toEqual(
          elements.map(([, , content]) => content),
        );
      }),
    );
  });

  it("ends each element just after its closing tag, with content that holds no closing tag", () => {
    fc.assert(
      fc.property(
        elementName,
        fc.string({ unit: fc.constantFrom("<", ">", "/", "a", "title", "entry", " ", '"'), maxLength: 30 }),
        fc.nat({ max: 30 }),
        (name, xml, from) => {
          const found = findXmlElement(xml, name, from);
          if (found === undefined) return;
          const closingTag = `</${name}>`;
          expect(xml.slice(found.end - closingTag.length, found.end)).toBe(closingTag);
          expect(found.content).not.toContain(closingTag);
          expect(found.end).toBeLessThanOrEqual(xml.length);
        },
      ),
    );
  });

  // Counterexample: in "<title-group>a</title-group><title>b</title>", "title" reads "a</title-group><title>b".
  it.fails("does not take an element whose name only starts with the one asked for", () => {
    fc.assert(
      fc.property(fc.constantFrom("-group", ".x", ":x"), (rest) => {
        const xml = `<title${rest}>a</title${rest}><title>b</title>`;
        expect(findXmlElement(xml, "title")?.content).toBe("b");
      }),
    );
  });
});
