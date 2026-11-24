import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  beginInlinedFileMarker,
  endInlinedFileMarker,
  notInlinedMarker,
} from "../../../../src/latex/flatten/flattenMarkers.js";

const markerText = fc
  .array(
    fc.oneof(
      fc.constantFrom(
        "chapters/intro.tex",
        "\\input{a}",
        " ",
        "\n",
        "\r\n",
        "\t",
        "\u2028",
        "%",
        "北京",
        "𝔸",
        "}",
      ),
      fc.string({ maxLength: 4 }),
    ),
    { maxLength: 8 },
  )
  .map((pieces) => pieces.join(""));

const LINE_BREAK = /[\n\r\u2028\u2029]/;

function collapsed(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

describe("flatten marker properties", () => {
  it("writes each marker as one comment line, the begin and not-inlined ones ending in their only newline", () => {
    fc.assert(
      fc.property(markerText, markerText, (path, written) => {
        for (const marker of [beginInlinedFileMarker(path, written), notInlinedMarker(written)]) {
          expect(marker.startsWith("% ")).toBe(true);
          expect(marker.endsWith("\n")).toBe(true);
          expect(LINE_BREAK.test(marker.slice(0, -1))).toBe(false);
        }
        const end = endInlinedFileMarker(path);
        expect(end.startsWith("% ")).toBe(true);
        expect(LINE_BREAK.test(end)).toBe(false);
      }),
    );
  });

  it("names the path and the include it came from, with their white space collapsed", () => {
    fc.assert(
      fc.property(markerText, markerText, (path, written) => {
        expect(beginInlinedFileMarker(path, written)).toBe(
          `% ---- begin ${collapsed(path)}, from ${collapsed(written)} ----\n`,
        );
        expect(endInlinedFileMarker(path)).toBe(`% ---- end ${collapsed(path)} ----`);
        expect(notInlinedMarker(written)).toBe(`% ---- not inlined: ${collapsed(written)} ----\n`);
      }),
    );
  });
});
