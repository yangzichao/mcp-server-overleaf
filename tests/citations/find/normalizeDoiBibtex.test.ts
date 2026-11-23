import { describe, expect, it } from "vitest";

import { formatBibtexEntry } from "../../../src/citations/find/bibtex/bibtexEntry.js";
import { normalizeDoiBibtex } from "../../../src/citations/find/doi/normalizeDoiBibtex.js";
import { citationKeyStem } from "../../../src/citations/find/keys/citationKeyStem.js";

/** doi.org's answer for 10.1109/cvpr.2016.90 with `Accept: application/x-bibtex`, as sent on 2026-11-22. */
const CROSSREF_ANSWER =
  " @inproceedings{He_2016, title={Deep Residual Learning for Image Recognition}, url={http://dx.doi.org/10.1109/cvpr.2016.90}, DOI={10.1109/cvpr.2016.90}, booktitle={2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)}, publisher={IEEE}, author={He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian}, year={2016}, month=June, pages={770–778} }";

/** The shape DataCite answers in, here for arXiv's own DOI of 1706.03762. */
const DATACITE_ANSWER = [
  "@misc{https://doi.org/10.48550/arxiv.1706.03762,",
  "  doi = {10.48550/ARXIV.1706.03762},",
  "  url = {https://arxiv.org/abs/1706.03762},",
  "  author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki},",
  "  keywords = {Computation and Language (cs.CL), Machine Learning (cs.LG)},",
  "  title = {Attention Is All You Need},",
  "  publisher = {arXiv},",
  "  year = {2017},",
  "  copyright = {arXiv.org perpetual, non-exclusive license}",
  "}",
].join("\n");

function normalized(answer: string): string {
  const draft = normalizeDoiBibtex(answer);
  if (!draft) throw new Error("no entry read");
  return formatBibtexEntry({ ...draft, key: citationKeyStem(draft) });
}

describe("normalizeDoiBibtex", () => {
  it("rewrites Crossref's one-line answer: fields in order, month macro, double hyphen, no DOI link", () => {
    expect(normalized(CROSSREF_ANSWER)).toBe(
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

  it("drops DataCite's keywords and copyright and keeps a link that is not the DOI", () => {
    expect(normalized(DATACITE_ANSWER)).toBe(
      [
        "@misc{vaswani2017attention,",
        "  author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki},",
        "  title = {Attention Is All You Need},",
        "  year = {2017},",
        "  publisher = {arXiv},",
        "  doi = {10.48550/ARXIV.1706.03762},",
        "  url = {https://arxiv.org/abs/1706.03762}",
        "}",
      ].join("\n"),
    );
  });

  it("turns Crossref's @inbook chapter with a booktitle into @incollection", () => {
    const chapter = normalizeDoiBibtex(
      " @inbook{Ronneberger_2015, title={U-Net: Convolutional Networks for Biomedical Image Segmentation}, ISBN={9783319245744}, ISSN={1611-3349}, url={http://dx.doi.org/10.1007/978-3-319-24574-4_28}, DOI={10.1007/978-3-319-24574-4_28}, booktitle={Medical Image Computing and Computer-Assisted Intervention \u2013 MICCAI 2015}, publisher={Springer International Publishing}, author={Ronneberger, Olaf and Fischer, Philipp and Brox, Thomas}, year={2015}, pages={234\u2013241} }",
    );
    expect(chapter?.entryType).toBe("incollection");
    expect(chapter && citationKeyStem(chapter)).toBe("ronneberger2015u");
    const wholeBook = normalizeDoiBibtex("@inbook{x, title = {Whole Book}, chapter = {3}}");
    expect(wholeBook?.entryType).toBe("inbook");
    expect(wholeBook?.fields.get("chapter")).toBe("3");
  });

  it("keeps an entry without a title or author, and one without a key", () => {
    const untitled = normalizeDoiBibtex(
      " @article{1981, volume={22}, url={https://doi.org/10.1093%2Foxfordjournals.pcp.a076264}, DOI={10.1093/oxfordjournals.pcp.a076264}, number={5}, journal={Plant and Cell Physiology}, year={1981} }",
    );
    expect(untitled && [...untitled.fields.keys()]).toEqual(["journal", "volume", "number", "year", "doi"]);
    expect(normalizeDoiBibtex("@misc{, title = {Keyless}}")?.fields.get("title")).toBe("Keyless");
  });

  it("reads nothing from a web page", () => {
    expect(normalizeDoiBibtex("<!DOCTYPE html><html><body>Not BibTeX</body></html>")).toBeUndefined();
  });
});
