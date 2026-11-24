import { describe, expect, it } from "vitest";

import { classifyCitationQuery } from "../../../src/citations/find/classifyCitationQuery.js";

describe("classifyCitationQuery", () => {
  it("reads a DOI bare, with a doi: prefix, or as a doi.org link", () => {
    for (const written of [
      "10.1038/nature14539",
      "  doi:10.1038/nature14539 ",
      "DOI: 10.1038/nature14539",
      "https://doi.org/10.1038/nature14539",
      "http://dx.doi.org/10.1038/nature14539",
      "doi.org/10.1038/nature14539",
    ]) {
      expect(classifyCitationQuery(written)).toEqual({ kind: "doi", doi: "10.1038/nature14539" });
    }
    expect(classifyCitationQuery("10.1002/(SICI)1097-4636(199706)35:4<487::AID-JBM8>3.0.CO;2-P")).toEqual({
      kind: "doi",
      doi: "10.1002/(SICI)1097-4636(199706)35:4<487::AID-JBM8>3.0.CO;2-P",
    });
  });

  it("reads an arXiv id in the forms people paste", () => {
    const forms: Array<[string, string]> = [
      ["1706.03762", "1706.03762"],
      ["1706.03762v5", "1706.03762v5"],
      ["arXiv:1706.03762", "1706.03762"],
      ["arxiv 1706.03762V2", "1706.03762v2"],
      ["https://arxiv.org/abs/1706.03762", "1706.03762"],
      ["https://arxiv.org/pdf/1706.03762v7.pdf", "1706.03762v7"],
      ["arxiv.org/abs/1706.03762/", "1706.03762"],
      ["https://export.arxiv.org/abs/2005.14165?context=cs", "2005.14165"],
      ["hep-th/9711200", "hep-th/9711200"],
      ["arXiv:math.GT/0309136", "math.GT/0309136"],
      ["HEP-TH/9711200v3", "hep-th/9711200v3"],
      ["https://doi.org/10.48550/arXiv.1706.03762", "1706.03762"],
      ["10.48550/ARXIV.2005.14165", "2005.14165"],
    ];
    for (const [written, arxivId] of forms) {
      expect(classifyCitationQuery(written), written).toEqual({ kind: "arxiv", arxivId });
    }
  });

  it("reads an old arXiv id whatever case its archive and subject class are in", () => {
    const forms: Array<[string, string]> = [
      ["math.gt/0309136", "math.GT/0309136"],
      ["arXiv:MATH.GT/0309136V2", "math.GT/0309136v2"],
      ["https://arxiv.org/abs/Math.Gt/0309136", "math.GT/0309136"],
    ];
    for (const [written, arxivId] of forms) {
      expect(classifyCitationQuery(written), written).toEqual({ kind: "arxiv", arxivId });
    }
  });

  it("takes anything else as words to search for, with its spacing tidied", () => {
    expect(classifyCitationQuery("  Attention is all\n you need  Vaswani 2017")).toEqual({
      kind: "text",
      text: "Attention is all you need Vaswani 2017",
    });
    expect(classifyCitationQuery("arXiv preprint on transformers")).toEqual({
      kind: "text",
      text: "arXiv preprint on transformers",
    });
    expect(classifyCitationQuery("1706.037")).toEqual({ kind: "text", text: "1706.037" });
    expect(classifyCitationQuery("   ")).toEqual({ kind: "text", text: "" });
  });
});
