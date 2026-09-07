import { describe, expect, it } from "vitest";

import { replaceTextOccurrences } from "../../src/latex/replaceTextOccurrences.js";

const paper = "The sample size is 5000. We report 5000 observations.";

describe("replaceTextOccurrences", () => {
  it("reports text that is not there rather than changing anything", () => {
    expect(replaceTextOccurrences(paper, "7000", "8000", false)).toEqual({ status: "not-found" });
  });

  it("replaces a unique match", () => {
    const result = replaceTextOccurrences(paper, "sample size", "sample", false);
    expect(result).toMatchObject({ status: "replaced", occurrenceCount: 1 });
  });

  it("refuses an ambiguous match instead of guessing", () => {
    expect(replaceTextOccurrences(paper, "5000", "8000", false)).toEqual({
      status: "ambiguous",
      occurrenceCount: 2,
    });
  });

  it("leaves the text untouched when the match is ambiguous", () => {
    const result = replaceTextOccurrences(paper, "5000", "8000", false);
    expect(result).not.toHaveProperty("updatedContent");
  });

  it("replaces every occurrence when told to", () => {
    const result = replaceTextOccurrences(paper, "5000", "8000", true);
    expect(result).toEqual({
      status: "replaced",
      occurrenceCount: 2,
      updatedContent: "The sample size is 8000. We report 8000 observations.",
    });
  });

  it("replaces only the first when replaceAll is off and the match is unique", () => {
    const result = replaceTextOccurrences("a b a", "b", "c", false);
    expect(result).toMatchObject({ updatedContent: "a c a" });
  });

  it("treats the find text literally, not as a pattern", () => {
    const result = replaceTextOccurrences("cost is $5.00", "$5.00", "$6.00", false);
    expect(result).toMatchObject({ updatedContent: "cost is $6.00" });
  });

  it("handles a LaTeX command containing backslashes and braces", () => {
    const result = replaceTextOccurrences(
      "see \\cite{smith2020} now",
      "\\cite{smith2020}",
      "\\cite{jones}",
      false,
    );
    expect(result).toMatchObject({ updatedContent: "see \\cite{jones} now" });
  });

  it("does not corrupt a replacement containing $& , which String.replace would expand", () => {
    const result = replaceTextOccurrences("value here", "value", "$& and more", false);
    expect(result).toMatchObject({ updatedContent: "$& and more here" });
  });

  it("replaces across a line boundary", () => {
    const result = replaceTextOccurrences("first\nsecond", "first\nsecond", "merged", false);
    expect(result).toMatchObject({ updatedContent: "merged" });
  });
});
