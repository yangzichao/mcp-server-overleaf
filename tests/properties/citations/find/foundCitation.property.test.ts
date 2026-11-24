import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createBibtexDraft } from "../../../../src/citations/find/bibtex/bibtexEntry.js";
import { CitationWriter } from "../../../../src/citations/find/foundCitation.js";
import type { BibliographyRecord } from "../../../../src/citations/parseBibliographyRecords.js";

const existingKey = fc.constantFrom(
  "vaswani2017attention",
  "Vaswani2017Attention",
  "he2016deep",
  "smith",
  "x",
);
const doi = fc.constantFrom("10.1000/abc", "10.1000/ABC", "10.5555/other");
const arxivId = fc.constantFrom("1706.03762", "1706.03762v5", "1706.03762v12", "hep-th/9901001v1");

const existingEntry: fc.Arbitrary<BibliographyRecord> = fc
  .record({
    key: existingKey,
    doi: fc.option(doi, { nil: undefined }),
    eprint: fc.option(arxivId, { nil: undefined }),
  })
  .map(({ key, doi: entryDoi, eprint }) => ({
    key,
    entryType: "article",
    location: { path: "refs.bib", line: 1 },
    fields: new Map([
      ...(entryDoi ? [["doi", entryDoi] as const] : []),
      ...(eprint ? [["eprint", eprint] as const, ["archiveprefix", "arXiv"] as const] : []),
    ]),
  }));

const draft = fc
  .record({
    author: fc.constantFrom("Vaswani, Ashish", "He, Kaiming", "Smith, J."),
    title: fc.constantFrom("Attention Is All You Need", "Deep Residual Learning", "X"),
    year: fc.constantFrom("2017", "2016"),
    doi: fc.option(doi, { nil: undefined }),
    eprint: fc.option(arxivId, { nil: undefined }),
  })
  .map(({ eprint, ...fields }) =>
    createBibtexDraft("article", { ...fields, ...(eprint ? { eprint, archivePrefix: "arXiv" } : {}) }),
  );

function withoutVersion(id: string): string {
  return id.replace(/v\d+$/i, "").toLowerCase();
}

describe("CitationWriter properties", () => {
  it("never chooses a key the bibliography, the taken keys or an earlier choice holds, in any case", () => {
    fc.assert(
      fc.property(
        fc.array(existingEntry, { maxLength: 4 }),
        fc.array(existingKey, { maxLength: 3 }),
        fc.array(draft, { minLength: 1, maxLength: 5 }),
        (existing, taken, drafts) => {
          const writer = new CitationWriter(existing, taken);
          const used = new Set(
            [...existing.map((entry) => entry.key), ...taken].map((key) => key.toLowerCase()),
          );
          for (const each of drafts) {
            const { key, bibtex } = writer.chosen(each);
            expect(used.has(key.toLowerCase())).toBe(false);
            expect(bibtex.startsWith(`@article{${key},\n`)).toBe(true);
            used.add(key.toLowerCase());
          }
        },
      ),
    );
  });

  it("keeps an offered key free, so offering again or then choosing gives the same key", () => {
    fc.assert(
      fc.property(fc.array(existingEntry, { maxLength: 4 }), draft, (existing, offered) => {
        const writer = new CitationWriter(existing, []);
        const first = writer.offered(offered);
        expect(writer.offered(offered)).toEqual(first);
        expect(writer.chosen(offered)).toEqual(first);
        expect(writer.chosen(offered).key).not.toBe(first.key);
      }),
    );
  });

  it("points at the first entry with the same DOI in any case, or else the same arXiv id in any version", () => {
    fc.assert(
      fc.property(fc.array(existingEntry, { maxLength: 4 }), draft, (existing, offered) => {
        const citation = new CitationWriter(existing, []).offered(offered);
        const draftDoi = citation.doi?.toLowerCase();
        const draftArxiv = citation.arxivId === undefined ? undefined : withoutVersion(citation.arxivId);
        const sameDoi = existing.find(
          (entry) => draftDoi !== undefined && entry.fields.get("doi")?.toLowerCase() === draftDoi,
        );
        const sameArxiv = existing.find((entry) => {
          const eprint = entry.fields.get("eprint");
          return draftArxiv !== undefined && eprint !== undefined && withoutVersion(eprint) === draftArxiv;
        });
        expect(citation.existingKey).toBe((sameDoi ?? sameArxiv)?.key);
      }),
    );
  });
});
