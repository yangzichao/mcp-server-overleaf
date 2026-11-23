import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseArxivPaper } from "../../../../../src/citations/find/arxiv/parseArxivPaper.js";
import { millisecondsToRun, pumpedText } from "../../../support/pumpedText.js";
import { arxivFeed } from "./generatedArxivFeed.js";

/** The pattern the versioned id was once read with. It is right but takes quadratic time, so it serves here as the reference. */
const VERSIONED_ID_REFERENCE = /arxiv\.org\/abs\/(\S+)$/i;

function titledEntry(inside: string): string {
  return `<feed><entry><title>T</title>${inside}</entry></feed>`;
}

describe("parseArxivPaper properties", () => {
  it("reads back the paper an arXiv answer describes", () => {
    fc.assert(
      fc.property(arxivFeed, ({ feed, paper }) => {
        expect(parseArxivPaper(feed)).toEqual({ kind: "paper", paper });
      }),
    );
  });

  it("reads the versioned id as the reference pattern does", () => {
    const idText = fc
      .array(
        fc.constantFrom("arxiv.org/abs/", "ARXIV.ORG/ABS/", "http://", "1706.03762v7", "x", "/", " ", "\t"),
        {
          maxLength: 8,
        },
      )
      .map((pieces) => pieces.join(""));
    fc.assert(
      fc.property(idText, (written) => {
        const answer = parseArxivPaper(titledEntry(`<id>${written}</id>`));
        const collapsed = written.replace(/\s+/g, " ").trim();
        expect(answer).toMatchObject({
          paper: { versionedId: VERSIONED_ID_REFERENCE.exec(collapsed)?.[1] ?? "" },
        });
      }),
    );
  });

  it("reads long runs of tags that never close at once", () => {
    const pieces = [
      "<entry",
      "<entry>",
      "ntry>",
      "<title>",
      "<author",
      "<author/",
      "<name>",
      "<arxiv:primary_category",
      "<category",
      ' term="',
      "<id>",
      "ARXIV.ORG/ABS/O",
      " ",
      "0",
      "<",
      ">",
    ];
    const feed = fc
      .tuple(
        fc.constantFrom("", "<entry>", "<entry><title>T</title>", "<entry><title>T</title><id>"),
        pumpedText(pieces, { minimumLength: 50_000, maximumLength: 200_000 }),
        fc.constantFrom("", "</entry>", " x</id></entry>"),
      )
      .map((parts) => parts.join(""));
    fc.assert(
      fc.property(feed, (written) => {
        expect(millisecondsToRun(() => parseArxivPaper(written))).toBeLessThan(1000);
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});
