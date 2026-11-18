import type { BibliographyRecord } from "../../citations/parseBibliographyRecords.js";
import type { CitationVerdict, ClosestSearchResult } from "../../citations/verifyBibliographyEntry.js";
import { describeLocation } from "../../latex/source/scannedSource.js";

/**
 * The reply `verify_citations` gives: a verdict line, then entries whose DOI or arXiv id
 * points somewhere wrong, then entries no search could confirm, then the confirmed ones.
 */

export interface VerifiedRecord {
  readonly record: BibliographyRecord;
  readonly verdict: CitationVerdict;
}

export interface CitationVerificationSummary {
  readonly bibliographyFiles: string[];
  readonly verified: VerifiedRecord[];
  readonly entriesNotLookedUp: number;
  readonly keysWithoutEntries: string[];
}

const IDENTIFIER_NAMES = { doi: "DOI", arxiv: "arXiv id" } as const;

function entryLabel(record: BibliographyRecord): string {
  return `${record.key} (${describeLocation(record.location)})`;
}

function plainTitle(record: BibliographyRecord): string {
  return (record.fields.get("title") ?? "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function describeProblem({ record, verdict }: VerifiedRecord): string | undefined {
  if (verdict.kind === "identifier-not-found") {
    return `${entryLabel(record)}: ${IDENTIFIER_NAMES[verdict.via]} ${verdict.identifier} does not resolve; ${verdict.detail}.`;
  }
  if (verdict.kind === "title-mismatch") {
    return `${entryLabel(record)}: ${IDENTIFIER_NAMES[verdict.via]} ${verdict.identifier} belongs to "${verdict.registeredTitle}", not "${plainTitle(record)}".`;
  }
  return undefined;
}

function describeClosest(closest: ClosestSearchResult | undefined): string {
  if (!closest) return "";
  const author = closest.firstAuthor ? ` by ${closest.firstAuthor}` : "";
  const year = closest.year ? ` (${closest.year})` : "";
  return ` The closest Crossref result is "${closest.title}"${author}${year}.`;
}

function describeUnconfirmed({ record, verdict }: VerifiedRecord): string | undefined {
  if (verdict.kind === "no-close-match") {
    const author = verdict.searchedAuthor ? ` by ${verdict.searchedAuthor}` : "";
    return `${entryLabel(record)}: no work titled "${plainTitle(record)}"${author} found in Crossref.${describeClosest(verdict.closest)}`;
  }
  if (verdict.kind === "not-checked") return `${entryLabel(record)}: not checked, because ${verdict.reason}.`;
  return undefined;
}

function describeConfirmed({ record, verdict }: VerifiedRecord): string | undefined {
  if (verdict.kind !== "confirmed") return undefined;
  if (verdict.via === "search") return `${record.key} (found in Crossref as DOI ${verdict.identifier})`;
  return `${record.key} (${IDENTIFIER_NAMES[verdict.via]})`;
}

function section(heading: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : ["", `${heading} (${lines.length}):`, ...lines.map((line) => `  ${line}`)];
}

function present(lines: ReadonlyArray<string | undefined>): string[] {
  return lines.filter((line): line is string => line !== undefined);
}

export function describeCitationVerification(summary: CitationVerificationSummary): string {
  const problems = present(summary.verified.map(describeProblem));
  const unconfirmed = present(summary.verified.map(describeUnconfirmed));
  const confirmed = present(summary.verified.map(describeConfirmed));
  const files = summary.bibliographyFiles.join(", ") || "the bibliography";
  const verdict =
    problems.length === 0
      ? "no entry points at the wrong work."
      : `${problems.length} ${problems.length === 1 ? "entry points" : "entries point"} at a missing or different work.`;

  const looked = summary.verified.length;
  const lines = [`Looked up ${looked} ${looked === 1 ? "entry" : "entries"} from ${files}: ${verdict}`];
  lines.push(...section("Wrong or unresolvable identifiers", problems));
  lines.push(
    ...section("Not confirmed; books, theses, reports and web pages are often not in Crossref", unconfirmed),
  );
  if (confirmed.length > 0) lines.push("", `Confirmed (${confirmed.length}): ${confirmed.join(", ")}`);
  if (summary.entriesNotLookedUp > 0) {
    lines.push(
      "",
      `${summary.entriesNotLookedUp} more ${summary.entriesNotLookedUp === 1 ? "entry was" : "entries were"} not looked up; pass keys, or a larger maximumEntries, to check them.`,
    );
  }
  if (summary.keysWithoutEntries.length > 0) {
    lines.push("", `No entry in any bibliography file for: ${summary.keysWithoutEntries.join(", ")}.`);
  }
  return lines.join("\n");
}
