import { describe, expect, it } from "vitest";

import { listsAuthor } from "../../src/citations/authorNames.js";
import { parseCrossrefSearchCandidates } from "../../src/citations/metadataServices/parseCrossrefWorks.js";

describe("parseCrossrefSearchCandidates", () => {
  it("reads DOI, titles, people and organisations as authors, and the issued year", () => {
    const body = JSON.stringify({
      status: "ok",
      message: {
        items: [
          {
            DOI: "10.1145/3065386",
            title: ["ImageNet classification with deep convolutional neural networks"],
            author: [{ given: "Alex", family: "Krizhevsky" }, { name: "Google Brain" }, { given: "Only" }],
            issued: { "date-parts": [[2017, 5, 24]] },
          },
          { DOI: "10.1/no-date", title: ["A"], subtitle: ["B"], published: { "date-parts": [[1999]] } },
          { DOI: "10.1/untitled" },
          { title: ["No DOI"] },
        ],
      },
    });
    expect(parseCrossrefSearchCandidates(body)).toEqual([
      {
        doi: "10.1145/3065386",
        titles: ["ImageNet classification with deep convolutional neural networks"],
        authorNames: ["Krizhevsky", "Google Brain"],
        year: 2017,
      },
      { doi: "10.1/no-date", titles: ["A", "A: B"], authorNames: [], year: 1999 },
    ]);
  });
});

describe("parseCrossrefSearchCandidates on a malformed answer", () => {
  it("skips a null item and keeps the rest", () => {
    const work = { DOI: "10.1/a", title: ["A"] };
    expect(parseCrossrefSearchCandidates(JSON.stringify({ message: { items: [null, 5, work] } }))).toEqual([
      { doi: "10.1/a", titles: ["A"], authorNames: [], year: undefined },
    ]);
  });

  it("finds no candidate when items is not a list or the answer is not an object", () => {
    expect(parseCrossrefSearchCandidates(JSON.stringify({ message: { items: { DOI: "10.1/a" } } }))).toEqual(
      [],
    );
    expect(parseCrossrefSearchCandidates("null")).toEqual([]);
  });
});

describe("listsAuthor", () => {
  it("matches a family name through LaTeX accents, case and a particle on one side only", () => {
    expect(listsAuthor(["Müller", "Smith"], 'M{\\"u}ller')).toBe(true);
    expect(listsAuthor(["van der Berg"], "Berg")).toBe(true);
    expect(listsAuthor(["Labaca-Castro"], "Goodfellow")).toBe(false);
    expect(listsAuthor([], "Goodfellow")).toBe(false);
  });
});
