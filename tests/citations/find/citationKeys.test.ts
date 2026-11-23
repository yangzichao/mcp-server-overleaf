import { describe, expect, it } from "vitest";

import { createBibtexDraft } from "../../../src/citations/find/bibtex/bibtexEntry.js";
import { CitationKeyRegistry } from "../../../src/citations/find/keys/citationKeyRegistry.js";
import { asciiWords, citationKeyStem } from "../../../src/citations/find/keys/citationKeyStem.js";

function stem(author: string | undefined, year: string | undefined, title: string | undefined): string {
  return citationKeyStem(createBibtexDraft("article", { author, year, title }));
}

describe("citation key stems", () => {
  it("joins the first author's family name, the year and the first word that is not a stopword", () => {
    expect(stem("Vaswani, Ashish and Shazeer, Noam", "2017", "Attention Is All You Need")).toBe(
      "vaswani2017attention",
    );
    expect(stem("Yann LeCun and Yoshua Bengio", "2015", "Deep learning")).toBe("lecun2015deep");
    expect(stem("Darwin, Charles", "1859", "On the Origin of Species")).toBe("darwin1859origin");
    expect(stem("Devlin, Jacob", "2019", "{BERT}: Pre-training of Deep Bidirectional Transformers")).toBe(
      "devlin2019bert",
    );
  });

  it("reads the family name the way BibTeX does, particles and all", () => {
    expect(stem("van der Maaten, Laurens", "2008", "Visualizing Data using t-SNE")).toBe(
      "maaten2008visualizing",
    );
    expect(stem("Laurens van der Maaten", "2008", "Visualizing Data")).toBe("maaten2008visualizing");
    expect(stem("Jean de La Fontaine", "1668", "Fables")).toBe("lafontaine1668fables");
    expect(stem("Smith-Jones, A. and Other, B.", "2001", "Results")).toBe("smithjones2001results");
    expect(stem("O'Brien, Flann", "1939", "At Swim-Two-Birds")).toBe("obrien1939swim");
  });

  it("drops accents written in LaTeX or Unicode", () => {
    expect(stem('M{\\"u}ller, J{\\"o}rg', "2020", '{\\"U}ber Zahlen')).toBe("muller2020uber");
    expect(stem("Müller, Jörg", "2020", "Über Zahlen")).toBe("muller2020uber");
    expect(stem("Søren Kierkegaard and {\\O}stergaard", "1843", "Either/Or")).toBe("kierkegaard1843either");
    expect(stem("Ł{\\'o}dź, X. and Gauß, C.", "1801", "Disquisitiones")).toBe("lodz1801disquisitiones");
    expect(asciiWords("Stra{\\ss}e $\\alpha$-helix \\textit{in vivo} \\& co")).toEqual([
      "strasse",
      "helix",
      "in",
      "vivo",
      "co",
    ]);
  });

  it("uses an organisation's first word, the editor when there is no author, and anon when neither", () => {
    expect(stem("{World Health Organization}", "2021", "Global report")).toBe("world2021global");
    expect(stem("{The ATLAS Collaboration} and Aad, G.", "2012", "Observation")).toBe("atlas2012observation");
    expect(
      citationKeyStem(createBibtexDraft("book", { editor: "Knuth, Donald", title: "Selected Papers" })),
    ).toBe("knuthselected");
    expect(stem(undefined, "2015", "The Road")).toBe("anon2015road");
    expect(stem("others", undefined, undefined)).toBe("anon");
    expect(stem("王小明", "2020", "研究")).toBe("anon2020");
  });

  it("splits authors only on an and outside braces", () => {
    expect(stem("{Barnes and Noble} and Smith, John", "1990", "A Catalogue")).toBe("barnes1990catalogue");
  });
});

describe("CitationKeyRegistry", () => {
  it("keeps a free stem, then appends b, c and so on, ignoring case", () => {
    const registry = new CitationKeyRegistry(["Vaswani2017Attention"]);
    expect(registry.firstFreeKey("vaswani2017attention")).toBe("vaswani2017attentionb");
    registry.reserve("vaswani2017attentionb");
    expect(registry.firstFreeKey("vaswani2017attention")).toBe("vaswani2017attentionc");
    expect(registry.firstFreeKey("lecun2015deep")).toBe("lecun2015deep");
  });

  it("moves to numbers after z", () => {
    const registry = new CitationKeyRegistry([
      "k",
      ..."bcdefghijklmnopqrstuvwxyz".split("").map((letter) => `k${letter}`),
    ]);
    expect(registry.firstFreeKey("k")).toBe("k27");
  });
});
