import { describe, expect, it } from "vitest";

import {
  BIBER_READING_RULES,
  BIBTEX_READING_RULES,
} from "../../../src/latex/bibliography/bibliographyReadingRules.js";
import { chooseBibliographyReadingRules } from "../../../src/latex/bibliography/chooseBibliographyReadingRules.js";
import { scanSource } from "../../../src/latex/source/scannedSource.js";

function rulesFor(...texts: string[]) {
  return chooseBibliographyReadingRules(texts.map((text, index) => scanSource(`file${index}.tex`, text)));
}

describe("chooseBibliographyReadingRules", () => {
  it("chooses BibTeX for a document that does not load biblatex", () => {
    expect(rulesFor("\\usepackage{natbib}\n\\bibliographystyle{plainnat}\n\\bibliography{refs}\n")).toBe(
      BIBTEX_READING_RULES,
    );
    expect(rulesFor("\\usepackage{biblatex-chicago-notes}\n")).toBe(BIBTEX_READING_RULES);
  });

  it("chooses biber for a document that loads biblatex, alone or in a list, with options on several lines", () => {
    expect(rulesFor("\\usepackage{biblatex}\n\\bibliography{refs}\n")).toBe(BIBER_READING_RULES);
    expect(rulesFor("\\usepackage{hyperref, biblatex}\n")).toBe(BIBER_READING_RULES);
    expect(rulesFor("\\usepackage[\n  style=authoryear,\n  backend=biber\n]{biblatex}\n")).toBe(
      BIBER_READING_RULES,
    );
    expect(rulesFor("\\RequirePackage[style=ieee]{biblatex}\n")).toBe(BIBER_READING_RULES);
  });

  it("chooses biber for a document that names its .bib files the way only biblatex does", () => {
    expect(rulesFor("\\addbibresource{refs.bib}\n")).toBe(BIBER_READING_RULES);
    expect(rulesFor("\\addglobalbib{refs.bib}\n")).toBe(BIBER_READING_RULES);
    expect(rulesFor("\\addsectionbib{refs.bib}\n")).toBe(BIBER_READING_RULES);
  });

  it("chooses BibTeX for biblatex loaded with backend=bibtex, bibtex8 or bibtexu", () => {
    expect(rulesFor("\\usepackage[backend=bibtex]{biblatex}\n\\addbibresource{refs.bib}\n")).toBe(
      BIBTEX_READING_RULES,
    );
    expect(rulesFor("\\usepackage[style=alpha, backend = bibtex8]{biblatex}\n")).toBe(BIBTEX_READING_RULES);
    expect(rulesFor("\\usepackage[backend=bibtexu,style=numeric]{biblatex}\n")).toBe(BIBTEX_READING_RULES);
  });

  it("looks in every file the document includes", () => {
    expect(rulesFor("\\input{preamble}\n\\bibliography{refs}\n", "\\usepackage{biblatex}\n")).toBe(
      BIBER_READING_RULES,
    );
  });
});
