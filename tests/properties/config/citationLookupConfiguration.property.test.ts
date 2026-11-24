import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CITATION_LOOKUP_ENDPOINTS,
  loadCitationLookupEndpoints,
} from "../../../src/config/citationLookupConfiguration.js";
import { ConfigurationError } from "../../../src/config/configurationError.js";

const VARIABLES = {
  doiResolverUrl: "OVERLEAF_MCP_DOI_RESOLVER_URL",
  crossrefApiUrl: "OVERLEAF_MCP_CROSSREF_API_URL",
  arxivApiUrl: "OVERLEAF_MCP_ARXIV_API_URL",
} as const;

const webAddress = fc
  .tuple(
    fc.constantFrom("http://", "https://", "HTTPS://"),
    fc.constantFrom("localhost:8080", "mirror.example.edu", "127.0.0.1", "[::1]:9"),
    fc.constantFrom("", "/", "/api", "/api/", "/api//", "/北京"),
  )
  .map((parts) => parts.join(""));
const writtenEndpoint = fc.option(
  fc.oneof(
    webAddress,
    fc.constantFrom(
      "",
      " ",
      "ftp://mirror.example.edu",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "mirror",
    ),
    fc.string({ maxLength: 12 }),
  ),
  { nil: undefined },
);
const environment = fc.record({
  OVERLEAF_MCP_DOI_RESOLVER_URL: writtenEndpoint,
  OVERLEAF_MCP_CROSSREF_API_URL: writtenEndpoint,
  OVERLEAF_MCP_ARXIV_API_URL: writtenEndpoint,
});

describe("loadCitationLookupEndpoints properties", () => {
  it("uses the default for a blank variable, else the http(s) address without its trailing slashes, else refuses", () => {
    fc.assert(
      fc.property(environment, (written) => {
        let endpoints: ReturnType<typeof loadCitationLookupEndpoints>;
        try {
          endpoints = loadCitationLookupEndpoints(written);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigurationError);
          return;
        }
        for (const [endpoint, variable] of Object.entries(VARIABLES) as [keyof typeof VARIABLES, string][]) {
          const trimmed = written[variable as keyof typeof written]?.trim();
          if (!trimmed) {
            expect(endpoints[endpoint]).toBe(DEFAULT_CITATION_LOOKUP_ENDPOINTS[endpoint]);
            continue;
          }
          expect(endpoints[endpoint]).toBe(trimmed.replace(/\/+$/, ""));
          expect(["http:", "https:"]).toContain(new URL(trimmed).protocol);
        }
      }),
    );
  });

  it("accepts every http and https address", () => {
    fc.assert(
      fc.property(webAddress, (address) => {
        const endpoints = loadCitationLookupEndpoints({ OVERLEAF_MCP_ARXIV_API_URL: address });
        expect(endpoints.arxivApiUrl.endsWith("/")).toBe(false);
      }),
    );
  });
});
