import { describe, expect, it } from "vitest";

import {
  canonicalFieldName,
  createBibtexDraft,
  findMissingFields,
  formatBibtexEntry,
} from "../../../src/citations/find/bibtex/bibtexEntry.js";

describe("BibTeX entries", () => {
  it("writes fields in a fixed order, braced, with a bare month macro and no trailing comma", () => {
    const draft = createBibtexDraft("InProceedings", {
      url: "https://example.org/paper?id=1#top",
      month: "June",
      title: "Deep Residual Learning for ImageNet",
      pages: "770–778",
      author: "He, Kaiming and Sun, Jian",
      doi: " 10.1109/cvpr.2016.90 ",
      publisher: "IEEE & Co",
    });
    expect(formatBibtexEntry({ ...draft, key: "he2016deep" })).toBe(
      [
        "@inproceedings{he2016deep,",
        "  author = {He, Kaiming and Sun, Jian},",
        "  title = {Deep Residual Learning for {ImageNet}},",
        "  pages = {770--778},",
        "  month = jun,",
        "  publisher = {IEEE \\& Co},",
        "  doi = {10.1109/cvpr.2016.90},",
        "  url = {https://example.org/paper?id=1#top}",
        "}",
      ].join("\n"),
    );
  });

  it("drops blank fields and keeps a month it cannot name as text", () => {
    const draft = createBibtexDraft("misc", { title: "  ", note: undefined, month: "Spring" });
    expect([...draft.fields]).toEqual([["month", "Spring"]]);
    expect(formatBibtexEntry({ ...draft, key: "anon" })).toBe("@misc{anon,\n  month = {Spring}\n}");
  });

  it("names the fields a reference needs that are missing", () => {
    expect(findMissingFields(createBibtexDraft("misc", {}))).toEqual(["author", "title", "year"]);
    expect(findMissingFields(createBibtexDraft("book", { editor: "Knuth, Donald", year: "1968" }))).toEqual([
      "title",
    ]);
  });

  it("spells field names the conventional way whatever case they come in", () => {
    expect(canonicalFieldName("ARCHIVEPREFIX")).toBe("archivePrefix");
    expect(canonicalFieldName("DOI")).toBe("doi");
    expect(canonicalFieldName("abstract")).toBeUndefined();
  });
});
