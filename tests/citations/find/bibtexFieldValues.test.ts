import { describe, expect, it } from "vitest";

import {
  balanceBraces,
  cleanFieldText,
  decodeHtmlEntities,
  markupToLatex,
  normalizePages,
  toMonthMacro,
} from "../../../src/citations/find/bibtex/bibtexFieldValues.js";

describe("BibTeX field values", () => {
  it("decodes named and numeric entities, and leaves unknown ones", () => {
    expect(decodeHtmlEntities("Smith &amp; Wesson &#8211; &#x2014; &lt;b&gt; &nbsp;&bogus;")).toBe(
      "Smith & Wesson \u2013 \u2014 <b> \u00a0&bogus;",
    );
    expect(decodeHtmlEntities("&#0; &#x110000;")).toBe("&#0; &#x110000;");
  });

  it("turns JATS and HTML emphasis into LaTeX, nested too, and drops other tags", () => {
    expect(markupToLatex("The <i>acrA</i> gene of <jats:italic>E. coli</jats:italic>")).toBe(
      "The \\textit{acrA} gene of \\textit{E. coli}",
    );
    expect(markupToLatex("H<sub>2</sub>O and x<sup>2</sup> in <sc>Rome</sc>")).toBe(
      "H\\textsubscript{2}O and x\\textsuperscript{2} in \\textsc{Rome}",
    );
    expect(markupToLatex("<b>bold <i>and italic</i></b>")).toBe("\\textbf{bold \\textit{and italic}}");
    expect(markupToLatex('<mml:math><mml:mi>x</mml:mi></mml:math> <span class="a">kept</span>')).toBe(
      "x kept",
    );
  });

  it("cleans a Crossref title whose markup arrives entity-encoded", () => {
    expect(
      cleanFieldText("Expression of &lt;italic&gt;acrA&lt;/italic&gt; in 50%   of\n cells & more #1"),
    ).toBe("Expression of \\textit{acrA} in 50\\% of cells \\& more \\#1");
    expect(cleanFieldText("Already \\& escaped")).toBe("Already \\& escaped");
  });

  it("keeps balanced braces and drops them when they cannot balance", () => {
    expect(balanceBraces("{BERT}: {Pre}-training")).toBe("{BERT}: {Pre}-training");
    expect(balanceBraces("a } b { c")).toBe("a  b  c");
    expect(balanceBraces("open { only")).toBe("open  only");
    expect(balanceBraces("an escaped \\{ brace")).toBe("an escaped \\{ brace");
  });

  it("writes page ranges with a double hyphen", () => {
    expect(normalizePages("436\u2013444")).toBe("436--444");
    expect(normalizePages("770-778")).toBe("770--778");
    expect(normalizePages("1 \u2014 9")).toBe("1--9");
    expect(normalizePages("12--20")).toBe("12--20");
    expect(normalizePages("e1002")).toBe("e1002");
  });

  it("reads months as BibTeX's macros", () => {
    expect(toMonthMacro("May")).toBe("may");
    expect(toMonthMacro("June")).toBe("jun");
    expect(toMonthMacro("{Sept.}")).toBe("sep");
    expect(toMonthMacro("6")).toBe("jun");
    expect(toMonthMacro("12")).toBe("dec");
    expect(toMonthMacro("13")).toBeUndefined();
    expect(toMonthMacro("Spring")).toBeUndefined();
    expect(toMonthMacro("ma")).toBeUndefined();
  });
});
