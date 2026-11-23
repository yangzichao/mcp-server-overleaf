import type { CitationSources } from "../../../citations/find/sources/citationSources.js";

/**
 * How long one look_up_citations call keeps starting lookups. arXiv allows one request every three
 * seconds, so a hundred arXiv entries would take five minutes, and many clients give up on a tool
 * call long before: the MCP TypeScript SDK's default request timeout is 60 seconds. The lookup
 * still running when the budget ends is allowed to finish, which leaves room under that minute.
 */
export const CITATION_LOOKUP_BUDGET_MS = 45_000;

export interface CitationLookupDeadline {
  readonly budgetSeconds: number;
  hasPassed(): boolean;
}

export function startCitationLookupDeadline(
  now: () => number = Date.now,
  budgetMs = CITATION_LOOKUP_BUDGET_MS,
): CitationLookupDeadline {
  const endsAt = now() + budgetMs;
  return { budgetSeconds: Math.round(budgetMs / 1000), hasPassed: () => now() >= endsAt };
}

/**
 * The sources, answering "unavailable" without a request once the deadline has passed, so a
 * search for many works ends with what it reached and says which queries to ask again.
 */
export function stopLookupsAtDeadline(
  sources: CitationSources,
  deadline: CitationLookupDeadline,
): CitationSources {
  const notLookedUp = {
    outcome: "unavailable",
    detail: `not looked up, because this call stopped starting lookups after ${deadline.budgetSeconds} seconds; ask again with this query`,
  } as const;
  return {
    fetchDoiBibtex: (doi) =>
      deadline.hasPassed() ? Promise.resolve(notLookedUp) : sources.fetchDoiBibtex(doi),
    fetchArxivPaper: (arxivId) =>
      deadline.hasPassed() ? Promise.resolve(notLookedUp) : sources.fetchArxivPaper(arxivId),
    searchCrossrefWorks: (query) =>
      deadline.hasPassed() ? Promise.resolve(notLookedUp) : sources.searchCrossrefWorks(query),
  };
}
