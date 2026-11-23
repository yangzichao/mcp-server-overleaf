import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { SearchCandidate } from "../../../../src/citations/metadataServices/metadataServices.js";
import { parseCrossrefSearchCandidates } from "../../../../src/citations/metadataServices/parseCrossrefWorks.js";

const nonBlankText = fc
  .string({ unit: "grapheme", minLength: 1, maxLength: 20 })
  .filter((text) => text.trim() !== "");
const crossrefAuthor = fc.oneof(
  fc.record({ family: nonBlankText, given: nonBlankText }, { requiredKeys: ["family"] }),
  fc.record({ name: nonBlankText }),
);
const dateParts = fc.integer({ min: 1900, max: 2100 }).map((year) => ({ "date-parts": [[year, 1, 1]] }));
const wellFormedWork = fc.record(
  {
    DOI: fc.stringMatching(/^10\.[0-9]{4,5}\/[a-z0-9.-]{1,10}$/),
    title: nonBlankText.map((title) => [title]),
    subtitle: nonBlankText.map((subtitle) => [subtitle]),
    author: fc.array(crossrefAuthor, { maxLength: 3 }),
    issued: dateParts,
    published: dateParts,
  },
  { requiredKeys: ["DOI", "title"] },
);
type CrossrefWork = typeof wellFormedWork extends fc.Arbitrary<infer Work> ? Work : never;

function expectedCandidate(work: CrossrefWork): SearchCandidate {
  const [title = ""] = work.title;
  const subtitle = work.subtitle?.[0];
  return {
    doi: work.DOI,
    titles: subtitle ? [title, `${title}: ${subtitle}`] : [title],
    authorNames: (work.author ?? []).map((author) =>
      ("family" in author ? author.family : author.name).trim(),
    ),
    year: (work.issued ?? work.published)?.["date-parts"][0]?.[0],
  };
}

/** Items Crossref might send that are not usable works: no DOI, or no title to compare. */
const unusableItem = fc.oneof(
  fc.integer(),
  fc.string(),
  fc.boolean(),
  fc.array(fc.jsonValue(), { maxLength: 3 }),
  fc.record({ title: fc.jsonValue(), author: fc.jsonValue(), issued: fc.jsonValue() }, { requiredKeys: [] }),
  fc.record({ DOI: fc.string(), title: fc.constantFrom([], [""], [1], null, {}) }),
);

function crossrefAnswer(items: readonly unknown[]): string {
  return JSON.stringify({ status: "ok", message: { "total-results": items.length, items } });
}

describe("parseCrossrefSearchCandidates properties", () => {
  it("reads back every well-formed work, with its titles, authors and year", () => {
    fc.assert(
      fc.property(fc.array(wellFormedWork, { maxLength: 5 }), (works) => {
        expect(parseCrossrefSearchCandidates(crossrefAnswer(works))).toEqual(works.map(expectedCandidate));
      }),
    );
  });

  it("skips unusable items without losing the well-formed ones around them", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.array(unusableItem, { maxLength: 2 }), wellFormedWork), { maxLength: 4 }),
        (pieces) => {
          const items = pieces.flatMap(([unusable, work]) => [...unusable, work]);
          expect(parseCrossrefSearchCandidates(crossrefAnswer(items))).toEqual(
            pieces.map(([, work]) => expectedCandidate(work)),
          );
        },
      ),
    );
  });

  // Found by this property: items [null, <a well-formed work>] once threw on null.DOI, so one null
  // item made the whole search "unavailable" instead of being skipped.
  it("skips a null item too", () => {
    fc.assert(
      fc.property(fc.array(wellFormedWork, { minLength: 1, maxLength: 3 }), (works) => {
        expect(parseCrossrefSearchCandidates(crossrefAnswer([null, ...works]))).toEqual(
          works.map(expectedCandidate),
        );
      }),
    );
  });
});
