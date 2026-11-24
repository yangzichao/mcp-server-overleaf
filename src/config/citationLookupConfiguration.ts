import { withoutTrailing } from "../text/withoutTrailing.js";
import { ConfigurationError } from "./configurationError.js";

/**
 * Where `look_up_citations` looks bibliography entries up. The defaults are the public
 * services; each can be pointed at a mirror or a proxy, and the tests point them at a fake.
 */

export interface CitationLookupEndpoints {
  /** DOI content negotiation, which answers for Crossref, DataCite and mEDRA DOIs alike. */
  readonly doiResolverUrl: string;
  readonly crossrefApiUrl: string;
  /** arXiv's legacy API. Its documented http:// address now redirects to this one. */
  readonly arxivApiUrl: string;
}

export const DEFAULT_CITATION_LOOKUP_ENDPOINTS: CitationLookupEndpoints = {
  doiResolverUrl: "https://doi.org",
  crossrefApiUrl: "https://api.crossref.org",
  arxivApiUrl: "https://export.arxiv.org/api",
};

function readEndpoint(rawValue: string | undefined, fallback: string, variableName: string): string {
  const trimmed = rawValue?.trim();
  if (!trimmed) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConfigurationError(`${variableName} must be an http or https URL, received "${trimmed}".`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigurationError(`${variableName} must be an http or https URL, received "${trimmed}".`);
  }
  return withoutTrailing(trimmed, "/");
}

export function loadCitationLookupEndpoints(environment: NodeJS.ProcessEnv): CitationLookupEndpoints {
  return {
    doiResolverUrl: readEndpoint(
      environment.OVERLEAF_MCP_DOI_RESOLVER_URL,
      DEFAULT_CITATION_LOOKUP_ENDPOINTS.doiResolverUrl,
      "OVERLEAF_MCP_DOI_RESOLVER_URL",
    ),
    crossrefApiUrl: readEndpoint(
      environment.OVERLEAF_MCP_CROSSREF_API_URL,
      DEFAULT_CITATION_LOOKUP_ENDPOINTS.crossrefApiUrl,
      "OVERLEAF_MCP_CROSSREF_API_URL",
    ),
    arxivApiUrl: readEndpoint(
      environment.OVERLEAF_MCP_ARXIV_API_URL,
      DEFAULT_CITATION_LOOKUP_ENDPOINTS.arxivApiUrl,
      "OVERLEAF_MCP_ARXIV_API_URL",
    ),
  };
}
