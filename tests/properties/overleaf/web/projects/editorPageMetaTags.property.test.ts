import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  readBooleanMetaTag,
  readJsonMetaTag,
  readMetaTag,
} from "../../../../../src/overleaf/web/projects/editorPageMetaTags.js";
import {
  LONG_ENOUGH_TO_EXPOSE_QUADRATIC_TIME,
  millisecondsToRun,
  pumpedText,
} from "../../../support/pumpedText.js";
import { editorPage, type GeneratedMetaTag } from "./pugMetaTags.js";

const RAW_PIECES = [
  "&#x110000;",
  "&#99999999;",
  "&#xD800;",
  "&#0;",
  "&#65;",
  "&amp;",
  "&bogus;",
  "'",
  '"',
  ">",
  "<",
  " content",
  "x",
];

function expectReadBack(page: string, { name, value }: GeneratedMetaTag): void {
  if (value.kind === "text") expect(readMetaTag(page, name)).toEqual({ content: value.text });
  if (value.kind === "json") expect(readJsonMetaTag(page, name)).toEqual(value.value);
  if (value.kind === "boolean") expect(readBooleanMetaTag(page, name)).toBe(value.value);
}

describe("editorPageMetaTags properties", () => {
  it("reads back every setting as Pug wrote it, whatever the other tags hold", () => {
    fc.assert(
      fc.property(editorPage, ({ tags, page }) => {
        for (const tag of tags) expectReadBack(page, tag);
        for (const absent of ["ol-missing", "ol-"]) expect(readMetaTag(page, absent)).toBeUndefined();
      }),
    );
  });

  it("never throws on a page, whatever its tags and entities", () => {
    const page = fc
      .array(fc.constantFrom(...RAW_PIECES), { maxLength: 8 })
      .map((pieces) => `<meta name="ol-a" content="${pieces.join("")}">`);
    fc.assert(
      fc.property(page, (written) => {
        readMetaTag(written, "ol-a");
        readJsonMetaTag(written, "ol-a");
        readBooleanMetaTag(written, "ol-a");
      }),
    );
  });

  it("reads long runs of meta tags that never close at once", () => {
    const pieces = [
      "<meta",
      "<meta ",
      "<META\t",
      ' name="ol-x"',
      "name='ol-x'",
      ' content="',
      '"',
      " ",
      "<",
      ">",
      "x",
    ];
    fc.assert(
      fc.property(pumpedText(pieces, LONG_ENOUGH_TO_EXPOSE_QUADRATIC_TIME), (page) => {
        expect(millisecondsToRun(() => readMetaTag(page, "ol-x"))).toBeLessThan(1000);
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});
