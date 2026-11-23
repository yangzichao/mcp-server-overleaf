import { describe, expect, it } from "vitest";

import { findArxivId, findDoi, findFirstAuthorFamilyName } from "../../src/citations/citationIdentifiers.js";
import { parseFirstArxivEntry } from "../../src/citations/metadataServices/parseArxivFeed.js";
import {
  type BibliographyRecord,
  parseBibliographyRecords,
} from "../../src/citations/parseBibliographyRecords.js";
import { titleSimilarity } from "../../src/citations/titleSimilarity.js";

function recordWith(fields: Record<string, string>): BibliographyRecord {
  return {
    key: "k",
    entryType: "article",
    location: { path: "refs.bib", line: 1 },
    fields: new Map(Object.entries(fields)),
  };
}

describe("parseBibliographyRecords", () => {
  it("reads braced, quoted, bare and concatenated values, and skips what is not an entry", () => {
    const records = parseBibliographyRecords(
      "refs.bib",
      [
        "@string{jml = {Journal of ML}}",
        "@Article{vaswani2017,",
        "  Title = {Attention Is {All} You Need},",
        '  author = "Vaswani, Ashish and Shazeer, Noam",',
        "  year = 2017,",
        '  journal = jml # " Letters",',
        "}",
        "% @misc{commented, title={Nope}}",
        "@misc(paren, title = {Parenthesised})",
      ].join("\n"),
    );
    expect(records.map((record) => record.key)).toEqual(["vaswani2017", "paren"]);
    const [first] = records;
    expect(first?.entryType).toBe("article");
    expect(first?.location.line).toBe(2);
    expect(first?.fields.get("title")).toBe("Attention Is {All} You Need");
    expect(first?.fields.get("author")).toBe("Vaswani, Ashish and Shazeer, Noam");
    expect(first?.fields.get("year")).toBe("2017");
    expect(first?.fields.get("journal")).toBe("jml Letters");
  });

  it("skips a malformed entry without losing the next one", () => {
    const records = parseBibliographyRecords(
      "refs.bib",
      "@article{broken, title = }\n@book{fine, title={Fine}}\n",
    );
    expect(records.map((record) => record.key)).toEqual(["fine"]);
  });

  it("reads no entry inside a field value, and leaves out one whose value a backslash cannot keep open", () => {
    const records = parseBibliographyRecords(
      "refs.bib",
      [
        "@article{outer, note = {see @misc{inner, title = {Inner}}}}",
        "@article{sale, title = {50\\% \\} off}}",
        "@book{fine, title = {Fine}}",
      ].join("\n"),
    );
    expect(records.map((record) => [record.key, Object.fromEntries(record.fields)])).toEqual([
      ["outer", { note: "see @misc{inner, title = {Inner}}" }],
      ["fine", { title: "Fine" }],
    ]);
  });
});

describe("citation identifiers", () => {
  it("finds a DOI in the doi field in any common spelling, or in a doi.org URL", () => {
    expect(findDoi(recordWith({ doi: "https://doi.org/10.1145/3065386" }))).toBe("10.1145/3065386");
    expect(findDoi(recordWith({ doi: "doi:10.1038/nature14539" }))).toBe("10.1038/nature14539");
    expect(findDoi(recordWith({ url: "https://dx.doi.org/10.1000/xyz123" }))).toBe("10.1000/xyz123");
    expect(findDoi(recordWith({ doi: "not a doi" }))).toBeUndefined();
  });

  it("finds an arXiv id in eprint, a URL, or the journal field", () => {
    expect(findArxivId(recordWith({ eprint: "1706.03762", archiveprefix: "arXiv" }))).toBe("1706.03762");
    expect(findArxivId(recordWith({ url: "https://arxiv.org/pdf/1706.03762v5.pdf" }))).toBe("1706.03762v5");
    expect(findArxivId(recordWith({ journal: "arXiv preprint arXiv:hep-th/9901001" }))).toBe(
      "hep-th/9901001",
    );
    expect(findArxivId(recordWith({ eprint: "1706.03762" }))).toBeUndefined();
  });

  it("takes the first author's family name in either name order", () => {
    expect(findFirstAuthorFamilyName(recordWith({ author: "Vaswani, Ashish and others" }))).toBe("Vaswani");
    expect(findFirstAuthorFamilyName(recordWith({ author: "Ashish Vaswani and Noam Shazeer" }))).toBe(
      "Vaswani",
    );
  });
});

describe("titleSimilarity", () => {
  it("ignores markup, accents, case and punctuation", () => {
    expect(
      titleSimilarity(
        "{BERT}: Pre-training of Deep \\emph{Bidirectional} Transformers",
        "BERT: pre-training of deep bidirectional transformers",
      ),
    ).toBe(1);
    expect(titleSimilarity("Caf\\'{e} society", "Café Society")).toBe(1);
  });

  it("accepts a title with its subtitle left off, but not a different work", () => {
    expect(
      titleSimilarity(
        "Deep residual learning for image recognition",
        "Deep residual learning for image recognition: a study",
      ),
    ).toBe(1);
    expect(
      titleSimilarity("Deep residual learning for image recognition", "Generative adversarial networks"),
    ).toBeLessThan(0.3);
  });
});

describe("parseFirstArxivEntry", () => {
  it("reads the entry title, not the feed title, and recognises an error entry", () => {
    expect(
      parseFirstArxivEntry(
        "<feed><title>ArXiv Query: id_list=1706.03762</title><entry><title>Attention Is All\n  You Need</title></entry></feed>",
      ),
    ).toEqual({ kind: "article", title: "Attention Is All You Need" });
    expect(
      parseFirstArxivEntry(
        "<feed><entry><title>Error</title><summary>incorrect id format for 1234.1</summary></entry></feed>",
      ),
    ).toEqual({ kind: "error", summary: "incorrect id format for 1234.1" });
    expect(parseFirstArxivEntry("<feed><title>empty</title></feed>")).toEqual({ kind: "none" });
  });
  // Named references were decoded first and numeric ones after, so "&amp;#65;" became "A".
  it("decodes each reference once, and keeps one past U+10FFFF as written", () => {
    expect(
      parseFirstArxivEntry("<feed><entry><title>R&amp;#65; &#x3B1; &#65;</title></entry></feed>"),
    ).toEqual({
      kind: "article",
      title: "R&#65; \u03b1 A",
    });
    expect(parseFirstArxivEntry("<feed><entry><title>Bad &#99999999;</title></entry></feed>")).toEqual({
      kind: "article",
      title: "Bad &#99999999;",
    });
  });
});
