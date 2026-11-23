import type { CitationQueryKind, CitationQueryResult } from "../../../citations/find/findCitations.js";
import type { FoundCitation } from "../../../citations/find/foundCitation.js";

/**
 * The reply look_up_citations (action find) gives: a summary line, then each query in the order
 * given, with the BibTeX for the work it named, the works a search offered, or why nothing came
 * back. Nothing is written to the project.
 */

const QUERY_KINDS: Record<CitationQueryKind, string> = { doi: "DOI", arxiv: "arXiv id", text: "words" };
const FOUND_IN: Record<CitationQueryKind, string> = { doi: "doi.org", arxiv: "arXiv", text: "Crossref" };

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function describeCitation(citation: FoundCitation): string[] {
  const notes: string[] = [];
  if (citation.existingKey !== undefined) {
    notes.push(
      `This work is already in the bibliography as ${citation.existingKey}; cite that key rather than adding the entry again.`,
    );
  }
  if (citation.missingFields.length > 0) {
    notes.push(`The source gave no ${citation.missingFields.join(", ")}; fill that in before citing it.`);
  }
  return [citation.bibtex, ...notes];
}

function describeResult(result: CitationQueryResult, index: number): string[] {
  const heading = `${index + 1}. ${JSON.stringify(result.query)} (${QUERY_KINDS[result.kind]})`;
  if (result.outcome === "found") {
    return [`${heading}: found in ${FOUND_IN[result.kind]}.`, ...describeCitation(result.citation)];
  }
  if (result.outcome === "candidates") {
    return [
      `${heading}: ${plural(result.candidates.length, "match", "matches")} in Crossref, best first. A search cannot know which work was meant, so compare title, authors and year before adding one.`,
      ...result.candidates.flatMap((candidate, candidateIndex) => [
        `Match ${candidateIndex + 1}:`,
        ...describeCitation(candidate),
      ]),
    ];
  }
  return [`${heading}: ${result.outcome === "not-found" ? "not found" : "no answer"}; ${result.detail}.`];
}

export function describeFoundCitations(
  results: readonly CitationQueryResult[],
  bibliographyFiles: readonly string[],
): string {
  const found = results.filter((result) => result.outcome === "found").length;
  const offered = results.filter((result) => result.outcome === "candidates").length;
  const keysAvoided =
    bibliographyFiles.length === 0
      ? "The project has no .bib file yet."
      : `Keys avoid those already in ${bibliographyFiles.join(", ")}.`;
  const summary = [
    `Looked up ${plural(results.length, "query", "queries")}: ${found} found, ${offered} with matches to choose from, ${results.length - found - offered} without an entry.`,
    keysAvoided,
    "Nothing was written to the project; add the entries you choose to a .bib file with edit_file.",
  ].join(" ");
  return [summary, ...results.flatMap((result, index) => ["", ...describeResult(result, index)])].join("\n");
}
