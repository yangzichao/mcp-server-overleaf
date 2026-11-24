import { type BibtexEntryDraft, createBibtexDraft } from "../bibtex/bibtexEntry.js";
import type { ArxivPaperRecord } from "./parseArxivPaper.js";

/**
 * An arXiv paper the way arXiv's own BibTeX export writes it: `@misc` with `eprint`,
 * `archivePrefix` and `primaryClass`, and the abstract page as `url`. Two things differ. The
 * year is the first version's rather than the latest's, so a new version does not change the
 * entry or its key. And a journal reference the authors added goes in `note`, with the
 * published version's DOI in `doi`, rather than being left out.
 *
 * `eprint` is the id as it was asked for: without a version it cites the paper, with one it
 * cites that version.
 */
export function arxivPaperEntry(paper: ArxivPaperRecord, requestedArxivId: string): BibtexEntryDraft {
  return createBibtexDraft("misc", {
    author: paper.authorNames.join(" and "),
    title: paper.title,
    year: /^\d{4}/.exec(paper.published ?? "")?.[0],
    eprint: requestedArxivId,
    archivePrefix: "arXiv",
    primaryClass: paper.primaryCategory,
    doi: paper.doi,
    url: `https://arxiv.org/abs/${requestedArxivId}`,
    note: paper.journalReference,
  });
}
