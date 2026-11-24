import { describe, expect, it } from "vitest";

import { formatBibtexEntry } from "../../../src/citations/find/bibtex/bibtexEntry.js";
import {
  type CrossrefWork,
  crossrefWorkEntry,
  readCrossrefSearchWorks,
} from "../../../src/citations/find/crossref/crossrefWorkEntry.js";
import { citationKeyStem } from "../../../src/citations/find/keys/citationKeyStem.js";

/**
 * The three works Crossref returned on 2026-11-22 for "deep residual learning for image
 * recognition" with rows=3 and the fields the search selects, authors cut to their names.
 */
const SEARCH_ANSWER = JSON.stringify({
  status: "ok",
  message: {
    items: [
      {
        publisher: "Wiley",
        DOI: "10.22541/au.170666177.72403547/v1",
        type: "posted-content",
        title: ["Multiple butterflies recognition based on deep residual learning and image analyze"],
        author: [
          { given: "Tianyu", family: "Xi", sequence: "first" },
          { given: "Jiangning", family: "Wang", sequence: "additional" },
        ],
        issued: { "date-parts": [[2024, 1, 31]] },
        published: { "date-parts": [[2024, 1, 31]] },
      },
      {
        publisher: "MDPI AG",
        issue: "18",
        DOI: "10.3390/app12188972",
        type: "journal-article",
        page: "8972",
        title: ["Deep Residual Learning for Image Recognition: A Survey"],
        volume: "12",
        author: [
          { given: "Muhammad", family: "Shafiq", sequence: "first" },
          { given: "Zhaoquan", family: "Gu", sequence: "additional" },
        ],
        "container-title": ["Applied Sciences"],
        issued: { "date-parts": [[2022, 9, 7]] },
      },
      {
        publisher: "IEEE",
        DOI: "10.1109/cvpr.2016.90",
        type: "proceedings-article",
        page: "770-778",
        title: ["Deep Residual Learning for Image Recognition"],
        author: [
          { given: "Kaiming", family: "He", sequence: "first" },
          { given: "Xiangyu", family: "Zhang", sequence: "additional" },
          { given: "Shaoqing", family: "Ren", sequence: "additional" },
          { given: "Jian", family: "Sun", sequence: "additional" },
        ],
        "container-title": ["2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)"],
        issued: { "date-parts": [[2016, 6]] },
      },
    ],
  },
});

function written(work: CrossrefWork): string {
  const draft = crossrefWorkEntry(work);
  if (!draft) throw new Error("no entry");
  return formatBibtexEntry({ ...draft, key: citationKeyStem(draft) });
}

describe("crossrefWorkEntry", () => {
  const [preprint, article, paper] = readCrossrefSearchWorks(SEARCH_ANSWER);

  it("writes a proceedings paper as @inproceedings with its booktitle", () => {
    expect(written(paper ?? {})).toBe(
      [
        "@inproceedings{he2016deep,",
        "  author = {He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian},",
        "  title = {Deep Residual Learning for Image Recognition},",
        "  booktitle = {2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)},",
        "  pages = {770--778},",
        "  year = {2016},",
        "  month = jun,",
        "  publisher = {IEEE},",
        "  doi = {10.1109/cvpr.2016.90}",
        "}",
      ].join("\n"),
    );
  });

  it("writes a journal article as @article, and a preprint as @misc with howpublished", () => {
    expect(written(article ?? {})).toBe(
      [
        "@article{shafiq2022deep,",
        "  author = {Shafiq, Muhammad and Gu, Zhaoquan},",
        "  title = {Deep Residual Learning for Image Recognition: A Survey},",
        "  journal = {Applied Sciences},",
        "  volume = {12},",
        "  number = {18},",
        "  pages = {8972},",
        "  year = {2022},",
        "  month = sep,",
        "  publisher = {MDPI AG},",
        "  doi = {10.3390/app12188972}",
        "}",
      ].join("\n"),
    );
    expect(written(preprint ?? {})).toContain("@misc{xi2024multiple,\n");
    expect(written(preprint ?? {})).toContain("  howpublished = {Wiley},\n");
  });

  it("writes chapters, books and theses with the fields their entry types use", () => {
    const chapter = crossrefWorkEntry({
      DOI: "10.1007/978-3-319-24574-4_28",
      type: "book-chapter",
      title: ["U-Net: Convolutional Networks for Biomedical Image Segmentation"],
      author: [{ given: "Olaf", family: "Ronneberger" }],
      editor: [{ given: "Nassir", family: "Navab" }],
      "container-title": ["Lecture Notes in Computer Science", "Medical Image Computing \u2013 MICCAI 2015"],
      page: "234-241",
      ISBN: ["9783319245737", "9783319245744"],
      publisher: "Springer International Publishing",
      "publisher-location": "Cham",
      published: { "date-parts": [[2015]] },
    });
    expect(chapter?.entryType).toBe("incollection");
    expect(Object.fromEntries(chapter?.fields ?? [])).toMatchObject({
      editor: "Navab, Nassir",
      booktitle: "Medical Image Computing \u2013 MICCAI 2015",
      series: "Lecture Notes in Computer Science",
      isbn: "9783319245737",
      address: "Cham",
      year: "2015",
    });
    const thesis = crossrefWorkEntry({
      DOI: "10.5555/t",
      type: "dissertation",
      title: ["T"],
      publisher: "MIT",
    });
    expect(thesis?.entryType).toBe("phdthesis");
    expect(thesis?.fields.get("school")).toBe("MIT");
    const report = crossrefWorkEntry({ DOI: "10.5555/r", type: "report", title: ["R"], publisher: "NIST" });
    expect(report?.fields.get("institution")).toBe("NIST");
  });

  it("braces organisations, joins a subtitle, and cleans JATS markup in the title", () => {
    const draft = crossrefWorkEntry({
      DOI: "10.5555/who",
      type: "journal-article",
      title: ["Is &lt;i&gt;E. coli&lt;/i&gt; resistant?"],
      subtitle: ["A survey of 50% of farms"],
      author: [
        { name: "World Health Organization" },
        { family: "King", given: "Martin Luther", suffix: "Jr." },
      ],
      "article-number": "e1002",
    });
    expect(draft?.fields.get("author")).toBe("{World Health Organization} and King, Jr., Martin Luther");
    expect(draft?.fields.get("title")).toBe("Is \\textit{E. coli} resistant? A survey of 50\\% of farms");
    expect(draft?.fields.get("pages")).toBe("e1002");
  });

  it("skips a work without a DOI or a title", () => {
    expect(crossrefWorkEntry({ title: ["No DOI"] })).toBeUndefined();
    expect(crossrefWorkEntry({ DOI: "10.5555/x", title: [] })).toBeUndefined();
    expect(readCrossrefSearchWorks('{"message":{"items":[null, 3, {"DOI":"10.5555/y"}]}}')).toEqual([
      { DOI: "10.5555/y" },
    ]);
  });
});
