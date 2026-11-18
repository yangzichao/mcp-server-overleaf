import type { CitationLookupEndpoints } from "../../config/citationLookupConfiguration.js";
import { describeFailure, fetchMetadata } from "./fetchMetadata.js";
import {
  firstString,
  type IdentifierLookup,
  type MetadataServices,
  type SearchLookup,
  titleForms,
} from "./metadataServices.js";
import { parseFirstArxivEntry } from "./parseArxivFeed.js";
import { parseCrossrefSearchCandidates } from "./parseCrossrefWorks.js";

/**
 * doi.org, arXiv and Crossref as their documentation describes them:
 *
 * - DOI content negotiation with `application/vnd.citationstyles.csl+json` answers for
 *   Crossref, DataCite and mEDRA DOIs; 404 means the DOI does not exist, and 204 or 406 that
 *   its agency has no metadata in that form.
 * - arXiv's terms allow one request every three seconds over a single connection.
 * - Crossref's public pool allows one concurrent request; requests here are sequential and
 *   spaced, and carry no mailto because there is no address of the user's to give.
 */

const CSL_JSON = "application/vnd.citationstyles.csl+json";
const ARXIV_REQUEST_INTERVAL_MS = 3_000;
const CROSSREF_REQUEST_INTERVAL_MS = 250;
const CROSSREF_SEARCH_ROWS = 5;

type Sleep = (milliseconds: number) => Promise<void>;
const realSleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Keeps calls to one service at least `intervalMs` apart. */
function spaced(intervalMs: number, sleep: Sleep): <T>(call: () => Promise<T>) => Promise<T> {
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  return async (call) => {
    const wait = lastStartedAt + intervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();
    return call();
  };
}

function encodeIdentifierPath(identifier: string): string {
  return identifier.split("/").map(encodeURIComponent).join("/");
}

async function lookupDoi(endpoints: CitationLookupEndpoints, doi: string): Promise<IdentifierLookup> {
  try {
    const response = await fetchMetadata(
      `${endpoints.doiResolverUrl}/${encodeIdentifierPath(doi)}`,
      CSL_JSON,
    );
    if (response.status === 404) return { outcome: "not-found", detail: "doi.org has no such DOI" };
    if (response.status !== 200) {
      return {
        outcome: "unavailable",
        detail: `doi.org answered ${response.status}, so the DOI's metadata could not be read`,
      };
    }
    const metadata = JSON.parse(response.body) as { title?: unknown; subtitle?: unknown };
    return {
      outcome: "found",
      titles: titleForms(firstString(metadata.title), firstString(metadata.subtitle)),
    };
  } catch (error) {
    return { outcome: "unavailable", detail: describeFailure("doi.org", error) };
  }
}

async function lookupArxiv(endpoints: CitationLookupEndpoints, arxivId: string): Promise<IdentifierLookup> {
  try {
    const response = await fetchMetadata(
      `${endpoints.arxivApiUrl}/query?id_list=${encodeIdentifierPath(arxivId)}`,
      "application/atom+xml",
    );
    const entry = parseFirstArxivEntry(response.body);
    if (entry.kind === "article") return { outcome: "found", titles: [entry.title] };
    if (entry.kind === "error")
      return { outcome: "not-found", detail: `arXiv refused the id: ${entry.summary}` };
    if (response.status !== 200)
      return { outcome: "unavailable", detail: `arXiv answered ${response.status}` };
    return { outcome: "not-found", detail: "arXiv has no paper with this id" };
  } catch (error) {
    return { outcome: "unavailable", detail: describeFailure("arXiv", error) };
  }
}

async function searchCrossref(endpoints: CitationLookupEndpoints, query: string): Promise<SearchLookup> {
  try {
    const parameters = new URLSearchParams({
      "query.bibliographic": query,
      rows: String(CROSSREF_SEARCH_ROWS),
    });
    const response = await fetchMetadata(
      `${endpoints.crossrefApiUrl}/works?${parameters}`,
      "application/json",
    );
    if (response.status !== 200)
      return { outcome: "unavailable", detail: `Crossref answered ${response.status}` };
    return { outcome: "searched", candidates: parseCrossrefSearchCandidates(response.body) };
  } catch (error) {
    return { outcome: "unavailable", detail: describeFailure("Crossref", error) };
  }
}

export function createPublicMetadataServices(
  endpoints: CitationLookupEndpoints,
  sleep: Sleep = realSleep,
): MetadataServices {
  const nextArxivRequest = spaced(ARXIV_REQUEST_INTERVAL_MS, sleep);
  const nextCrossrefRequest = spaced(CROSSREF_REQUEST_INTERVAL_MS, sleep);
  return {
    lookupDoi: (doi) => lookupDoi(endpoints, doi),
    lookupArxiv: (arxivId) => nextArxivRequest(() => lookupArxiv(endpoints, arxivId)),
    searchCrossref: (query) => nextCrossrefRequest(() => searchCrossref(endpoints, query)),
  };
}
