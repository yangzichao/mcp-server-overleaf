import type { CitationLookupEndpoints } from "../../../config/citationLookupConfiguration.js";
import {
  describeFailure,
  fetchMetadata,
  type MetadataResponse,
} from "../../metadataServices/fetchMetadata.js";
import { encodeIdentifierPath } from "../../metadataServices/publicMetadataServices.js";
import {
  ARXIV_REQUEST_INTERVAL_MS,
  CROSSREF_SEARCH_INTERVAL_MS,
  DOI_RESOLVER_REQUEST_INTERVAL_MS,
  REAL_CLOCK,
  type RequestClock,
  sharedSpacedRequests,
} from "../../metadataServices/requestSpacing.js";
import { parseArxivPaper } from "../arxiv/parseArxivPaper.js";
import { CROSSREF_WORK_FIELDS, readCrossrefSearchWorks } from "../crossref/crossrefWorkEntry.js";
import {
  type ArxivPaperLookup,
  type CitationSources,
  CROSSREF_CANDIDATE_COUNT,
  type CrossrefWorksSearch,
  type DoiBibtexLookup,
} from "./citationSources.js";

/**
 * doi.org, arXiv and Crossref as they answer (checked 2026-11-22):
 *
 * - DOI content negotiation with `application/x-bibtex` answers for Crossref and DataCite
 *   DOIs. 404 means the DOI does not exist; 204 or 406 that its agency offers no BibTeX. An
 *   agency without content negotiation redirects to the work's web page instead.
 * - The arXiv API answers in Atom, one request every three seconds.
 * - A Crossref search asks only for the fields an entry needs, which keeps the answer to a few
 *   kilobytes instead of carrying every work's reference list.
 * - Crossref, which answers doi.org for its DOIs, sends 429 to a request made while another
 *   from the same address is running. One more try after a pause usually gets through.
 */

const BIBTEX = "application/x-bibtex";
const BIBTEX_ENTRY_START = /^\s*@\s*[A-Za-z]+\s*[{(]/;
const TOO_MANY_REQUESTS_PAUSE_MS = 1_100;

type MetadataRequest = (url: string, accept: string) => Promise<MetadataResponse>;

function retryingOnceWhenTooMany(clock: RequestClock): MetadataRequest {
  return async (url, accept) => {
    const response = await fetchMetadata(url, accept);
    if (response.status !== 429) return response;
    await clock.sleep(TOO_MANY_REQUESTS_PAUSE_MS);
    return fetchMetadata(url, accept);
  };
}

async function fetchDoiBibtex(
  endpoints: CitationLookupEndpoints,
  request: MetadataRequest,
  doi: string,
): Promise<DoiBibtexLookup> {
  try {
    const response = await request(`${endpoints.doiResolverUrl}/${encodeIdentifierPath(doi)}`, BIBTEX);
    if (response.status === 404) return { outcome: "not-found", detail: "doi.org has no such DOI" };
    if (response.status === 204 || response.status === 406) {
      return {
        outcome: "unavailable",
        detail: `the DOI exists, but its registration agency offers no BibTeX for it (doi.org answered ${response.status})`,
      };
    }
    if (response.status !== 200) {
      return {
        outcome: "unavailable",
        detail: `doi.org answered ${response.status}, so no BibTeX could be read`,
      };
    }
    if (!BIBTEX_ENTRY_START.test(response.body)) {
      return {
        outcome: "unavailable",
        detail:
          "doi.org sent the work's web page rather than BibTeX; its registration agency does not offer BibTeX",
      };
    }
    return { outcome: "found", bibtex: response.body };
  } catch (error) {
    return { outcome: "unavailable", detail: describeFailure("doi.org", error) };
  }
}

async function fetchArxivPaper(
  endpoints: CitationLookupEndpoints,
  arxivId: string,
): Promise<ArxivPaperLookup> {
  try {
    const response = await fetchMetadata(
      `${endpoints.arxivApiUrl}/query?id_list=${encodeIdentifierPath(arxivId)}`,
      "application/atom+xml",
    );
    const answer = parseArxivPaper(response.body);
    if (answer.kind === "paper") return { outcome: "found", paper: answer.paper };
    if (answer.kind === "error")
      return { outcome: "not-found", detail: `arXiv refused the id: ${answer.summary}` };
    if (response.status !== 200)
      return { outcome: "unavailable", detail: `arXiv answered ${response.status}` };
    return { outcome: "not-found", detail: "arXiv has no paper with this id" };
  } catch (error) {
    return { outcome: "unavailable", detail: describeFailure("arXiv", error) };
  }
}

async function searchCrossrefWorks(
  endpoints: CitationLookupEndpoints,
  request: MetadataRequest,
  bibliographicQuery: string,
): Promise<CrossrefWorksSearch> {
  try {
    const parameters = new URLSearchParams({
      "query.bibliographic": bibliographicQuery,
      rows: String(CROSSREF_CANDIDATE_COUNT),
      select: CROSSREF_WORK_FIELDS.join(","),
    });
    const response = await request(`${endpoints.crossrefApiUrl}/works?${parameters}`, "application/json");
    if (response.status === 429) {
      return { outcome: "unavailable", detail: "Crossref answered 429: too many requests from this address" };
    }
    if (response.status !== 200)
      return { outcome: "unavailable", detail: `Crossref answered ${response.status}` };
    return { outcome: "searched", works: readCrossrefSearchWorks(response.body) };
  } catch (error) {
    return { outcome: "unavailable", detail: describeFailure("Crossref", error) };
  }
}

/**
 * Requests to each service are spaced as it asks, in one queue per service shared with the
 * citation check, so the two running together still keep arXiv's three seconds. A test passes
 * a clock of its own and gets queues of its own.
 */
export function createPublicCitationSources(
  endpoints: CitationLookupEndpoints,
  clock: RequestClock = REAL_CLOCK,
): CitationSources {
  const nextDoiRequest = sharedSpacedRequests("doi.org", DOI_RESOLVER_REQUEST_INTERVAL_MS, clock);
  const nextArxivRequest = sharedSpacedRequests("arXiv", ARXIV_REQUEST_INTERVAL_MS, clock);
  const nextSearch = sharedSpacedRequests("Crossref search", CROSSREF_SEARCH_INTERVAL_MS, clock);
  const request = retryingOnceWhenTooMany(clock);
  return {
    fetchDoiBibtex: (doi) => nextDoiRequest(() => fetchDoiBibtex(endpoints, request, doi)),
    fetchArxivPaper: (arxivId) => nextArxivRequest(() => fetchArxivPaper(endpoints, arxivId)),
    searchCrossrefWorks: (query) => nextSearch(() => searchCrossrefWorks(endpoints, request, query)),
  };
}
