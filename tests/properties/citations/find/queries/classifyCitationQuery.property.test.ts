import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { classifyCitationQuery } from "../../../../../src/citations/find/classifyCitationQuery.js";
import { arxivIdentifier, doi, writtenArxivId, writtenDoi } from "./writtenCitationIdentifiers.js";

const WORDS = [
  "Attention",
  "is",
  "all",
  "you",
  "need",
  "Vaswani",
  "2017",
  "arXiv",
  "doi:",
  "10.1038",
  "1706.037",
  "hep-th",
  "論文",
  "Ünïcødé",
];
const SPACES = [" ", "  ", "\n", "\t", " ", " \r\n "];

describe("classifyCitationQuery properties", () => {
  it("reads a DOI in every form people paste as that DOI", () => {
    const pasted = doi.chain((written) => writtenDoi(written).map((query) => ({ written, query })));
    fc.assert(
      fc.property(pasted, ({ written, query }) => {
        expect(classifyCitationQuery(query)).toEqual({ kind: "doi", doi: written });
      }),
    );
  });

  it("reads an arXiv id in any letter case, in every form people paste, as arXiv writes it", () => {
    const pasted = arxivIdentifier.chain((identifier) =>
      writtenArxivId(identifier).map((query) => ({ identifier, query })),
    );
    fc.assert(
      fc.property(pasted, ({ identifier, query }) => {
        expect(classifyCitationQuery(query)).toEqual({ kind: "arxiv", arxivId: identifier.canonical });
      }),
    );
  });

  it("takes words that name no identifier as text, one space between them", () => {
    const words = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 6 });
    const query = words.chain((chosen) =>
      fc
        .array(fc.constantFrom(...SPACES), { minLength: chosen.length + 1, maxLength: chosen.length + 1 })
        .map((spaces) => ({
          chosen,
          written: chosen.map((word, index) => `${spaces[index]}${word}`).join("") + spaces[chosen.length],
        })),
    );
    fc.assert(
      fc.property(query, ({ chosen, written }) => {
        expect(classifyCitationQuery(written)).toEqual({ kind: "text", text: chosen.join(" ") });
      }),
    );
  });
});
