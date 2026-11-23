import { describe, expect, it } from "vitest";

import { protectTitleCapitals } from "../../../src/citations/find/bibtex/protectTitleCapitals.js";

describe("protectTitleCapitals", () => {
  it("braces acronyms and words with inner capitals, outside their punctuation", () => {
    expect(protectTitleCapitals("BERT: Pre-training of Deep Bidirectional Transformers")).toBe(
      "{BERT}: Pre-training of Deep Bidirectional Transformers",
    );
    expect(protectTitleCapitals("ImageNet classification with (LSTM) GPT-4, t-SNE and 3D")).toBe(
      "{ImageNet} classification with ({LSTM}) {GPT-4}, {t-SNE} and {3D}",
    );
  });

  it("leaves title case, hyphenated title-case compounds and plain words alone", () => {
    expect(protectTitleCapitals("Attention Is All You Need")).toBe("Attention Is All You Need");
    expect(protectTitleCapitals("Self-Attention for Large-Scale Real-Time Systems")).toBe(
      "Self-Attention for Large-Scale Real-Time Systems",
    );
  });

  it("does not reach into braces, commands or math", () => {
    expect(protectTitleCapitals("{The ImageNet Challenge} and \\textit{E. coli}")).toBe(
      "{The ImageNet Challenge} and \\textit{E. coli}",
    );
    expect(protectTitleCapitals("Bounds of $O(N \\log N)$ for NP and $a + BC$")).toBe(
      "Bounds of $O(N \\log N)$ for {NP} and $a + BC$",
    );
  });

  it("leaves a title in capitals throughout as it is", () => {
    expect(protectTitleCapitals("DEEP LEARNING FOR NLP")).toBe("DEEP LEARNING FOR NLP");
  });
});
