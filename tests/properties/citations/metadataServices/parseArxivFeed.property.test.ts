import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseFirstArxivEntry } from "../../../../src/citations/metadataServices/parseArxivFeed.js";

const NAMED_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** Escapes text as XML, writing some characters as numeric references, which a feed may also do. */
const escapedXmlText = (text: string): fc.Arbitrary<string> =>
  fc
    .array(fc.boolean(), { minLength: [...text].length, maxLength: [...text].length })
    .map((numericChoices) =>
      [...text]
        .map((character, index) =>
          numericChoices[index]
            ? `&#${character.codePointAt(0) ?? 0};`
            : (NAMED_ENTITIES[character] ?? character),
        )
        .join(""),
    );

const titleText = fc.oneof(
  fc.string({ unit: "grapheme", minLength: 1 }),
  fc
    .array(fc.constantFrom("Attention", " ", "Is", "All", "\n  ", "&", "<b>", "'", '"', "北京", "𝔸", "Q&A"), {
      minLength: 1,
      maxLength: 8,
    })
    .map((pieces) => pieces.join("")),
);

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function feedWithEntryTitle(escapedTitle: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '  <title type="html">ArXiv Query: id_list=2101.00001</title>',
    "  <entry>",
    "    <id>http://arxiv.org/abs/2101.00001v1</id>",
    `    <title>${escapedTitle}</title>`,
    "    <summary>Abstract.</summary>",
    "  </entry>",
    "</feed>",
  ].join("\n");
}

describe("parseFirstArxivEntry properties", () => {
  it("reads back the entry's title, unescaped and with its whitespace collapsed", () => {
    fc.assert(
      fc.property(
        titleText
          .filter((title) => !title.includes("&#"))
          .chain((title) => fc.tuple(fc.constant(title), escapedXmlText(title))),
        ([title, escaped]) => {
          const expected = collapseWhitespace(title);
          fc.pre(expected !== "" && expected !== "Error");
          expect(parseFirstArxivEntry(feedWithEntryTitle(escaped))).toEqual({
            kind: "article",
            title: expected,
          });
        },
      ),
    );
  });

  // Found by this property: a title "&#65;", sent as "&amp;#65;", once came back as "A", because
  // named references were decoded first and numeric ones after.
  it("reads back a title that itself contains the text of a numeric reference", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z ]{0,6}&#[0-9]{2,3};[A-Za-z ]{0,6}$/), (title) => {
        const expected = collapseWhitespace(title);
        expect(parseFirstArxivEntry(feedWithEntryTitle(title.replaceAll("&", "&amp;")))).toEqual({
          kind: "article",
          title: expected,
        });
      }),
    );
  });

  it("reports an arXiv error entry with its summary", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9 .:]{1,30}$/), (summary) => {
        const feed = `<feed><entry><title>Error</title><summary>${summary}</summary></entry></feed>`;
        expect(parseFirstArxivEntry(feed)).toEqual({ kind: "error", summary: collapseWhitespace(summary) });
      }),
    );
  });

  it("finds no entry in a feed without one, whatever its own title says", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        fc.pre(!text.includes("<entry"));
        expect(parseFirstArxivEntry(`<feed><title>${text}</title></feed>`)).toEqual({ kind: "none" });
      }),
    );
  });
});
