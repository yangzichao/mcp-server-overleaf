import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { readMetaTag } from "../../../../../src/overleaf/web/projects/editorPageMetaTags.js";
import { millisecondsToRun, pumpedText } from "../../../support/pumpedText.js";

describe("readMetaTag properties", () => {
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
      fc.property(pumpedText(pieces, { minimumLength: 50_000, maximumLength: 200_000 }), (page) => {
        expect(millisecondsToRun(() => readMetaTag(page, "ol-x"))).toBeLessThan(1000);
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});
