import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findCitations } from "../../../src/citations/find/findCitations.js";
import { createPublicCitationSources } from "../../../src/citations/find/sources/publicCitationSources.js";
import type { RequestClock } from "../../../src/citations/metadataServices/requestSpacing.js";
import { loadCitationLookupEndpoints } from "../../../src/config/citationLookupConfiguration.js";
import { FakeMetadataServices } from "../../integration/fakeMetadataServices.js";

/** A clock that moves only when the code under test sleeps, and remembers each wait. */
function steppingClock(): RequestClock & { waits: number[] } {
  let now = 1_000_000;
  const waits: number[] = [];
  return {
    waits,
    now: () => now,
    sleep: (milliseconds) => {
      waits.push(milliseconds);
      now += milliseconds;
      return Promise.resolve();
    },
  };
}

const HE_2016_BIBTEX =
  " @inproceedings{He_2016, title={Deep Residual Learning for Image Recognition}, url={http://dx.doi.org/10.1109/cvpr.2016.90}, DOI={10.1109/cvpr.2016.90}, booktitle={2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)}, publisher={IEEE}, author={He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian}, year={2016}, month=June, pages={770–778} }";

describe("public citation sources", () => {
  let services: FakeMetadataServices;
  let clock: ReturnType<typeof steppingClock>;

  beforeEach(async () => {
    services = await FakeMetadataServices.start();
    clock = steppingClock();
  });

  afterEach(async () => {
    await services.stop();
  });

  function sources() {
    return createPublicCitationSources(loadCitationLookupEndpoints(services.environment()), clock);
  }

  it("asks doi.org for BibTeX and tells a missing DOI from one without BibTeX", async () => {
    services.doiBibtex.set("10.1109/cvpr.2016.90", HE_2016_BIBTEX);
    services.dois.set("10.5555/csl-only", { title: "Only CSL JSON" });
    services.doiBibtex.set("10.5555/landing", "<!DOCTYPE html><html><title>Publisher</title></html>");
    const citationSources = sources();

    expect(await citationSources.fetchDoiBibtex("10.1109/cvpr.2016.90")).toEqual({
      outcome: "found",
      bibtex: HE_2016_BIBTEX,
    });
    expect(await citationSources.fetchDoiBibtex("10.5555/nowhere")).toEqual({
      outcome: "not-found",
      detail: "doi.org has no such DOI",
    });
    expect(await citationSources.fetchDoiBibtex("10.5555/csl-only")).toMatchObject({
      outcome: "unavailable",
      detail: expect.stringContaining("offers no BibTeX for it (doi.org answered 406)"),
    });
    expect(await citationSources.fetchDoiBibtex("10.5555/landing")).toMatchObject({
      outcome: "unavailable",
      detail: expect.stringContaining("web page rather than BibTeX"),
    });
    expect(services.requests[0]).toMatchObject({
      path: "/doi/10.1109/cvpr.2016.90",
      accept: "application/x-bibtex",
    });
    expect(services.requests[0]?.userAgent).toMatch(/^mcp-server-overleaf\//);
  });

  it("keeps arXiv requests three seconds apart and Crossref searches over a second apart", async () => {
    services.arxivPapers.set("1706.03762", {
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani"],
      published: "2017-06-12T17:57:34Z",
      primaryCategory: "cs.CL",
      latestVersion: 7,
    });
    const citationSources = sources();
    const first = await citationSources.fetchArxivPaper("1706.03762");
    await citationSources.fetchArxivPaper("2005.14165");
    await citationSources.fetchArxivPaper("1706.03762");
    await citationSources.searchCrossrefWorks("deep learning");
    await citationSources.searchCrossrefWorks("attention");

    expect(first).toEqual({
      outcome: "found",
      paper: {
        versionedId: "1706.03762v7",
        title: "Attention Is All You Need",
        authorNames: ["Ashish Vaswani"],
        published: "2017-06-12T17:57:34Z",
        primaryCategory: "cs.CL",
        doi: undefined,
        journalReference: undefined,
      },
    });
    expect(clock.waits).toEqual([3_000, 3_000, 1_100]);
  });

  it("searches Crossref for three works, asking only for the fields an entry needs", async () => {
    services.searchResults = [{ DOI: "10.5555/a", title: ["A"] }];
    const search = await sources().searchCrossrefWorks("deep residual learning he 2016");

    expect(search).toEqual({ outcome: "searched", works: [{ DOI: "10.5555/a", title: ["A"] }] });
    const query = services.requests[0]?.query;
    expect(query?.get("query.bibliographic")).toBe("deep residual learning he 2016");
    expect(query?.get("rows")).toBe("3");
    expect(query?.get("select")).toBe(
      "DOI,type,title,subtitle,author,editor,container-title,volume,issue,page,article-number,issued,published,publisher,publisher-location,ISBN",
    );
  });

  it("tries once more after a 429, and reports a second one", async () => {
    services.doiBibtex.set("10.1109/cvpr.2016.90", HE_2016_BIBTEX);
    const citationSources = sources();

    services.tooManyRequestsAhead = 1;
    expect(await citationSources.fetchDoiBibtex("10.1109/cvpr.2016.90")).toMatchObject({ outcome: "found" });
    expect(clock.waits).toEqual([1_100]);

    services.tooManyRequestsAhead = 2;
    expect(await citationSources.fetchDoiBibtex("10.1109/cvpr.2016.90")).toEqual({
      outcome: "unavailable",
      detail: "doi.org answered 429, so no BibTeX could be read",
    });
    services.tooManyRequestsAhead = 2;
    expect(await citationSources.searchCrossrefWorks("deep learning")).toEqual({
      outcome: "unavailable",
      detail: "Crossref answered 429: too many requests from this address",
    });
    expect(services.requests).toHaveLength(6);
  });

  it("says a service could not be reached", async () => {
    const unreachable = createPublicCitationSources(
      loadCitationLookupEndpoints({
        OVERLEAF_MCP_DOI_RESOLVER_URL: "http://127.0.0.1:9",
        OVERLEAF_MCP_ARXIV_API_URL: "http://127.0.0.1:9",
        OVERLEAF_MCP_CROSSREF_API_URL: "http://127.0.0.1:9",
      }),
      clock,
    );
    expect(await unreachable.fetchDoiBibtex("10.5555/a")).toMatchObject({
      outcome: "unavailable",
      detail: expect.stringMatching(/^doi\.org could not be reached/),
    });
    expect(await unreachable.fetchArxivPaper("1706.03762")).toMatchObject({ outcome: "unavailable" });
    expect(await unreachable.searchCrossrefWorks("x")).toMatchObject({ outcome: "unavailable" });
  });

  it("finds entries end to end, through HTTP, for a DOI, an arXiv link and words", async () => {
    services.doiBibtex.set("10.1109/cvpr.2016.90", HE_2016_BIBTEX);
    services.arxivPapers.set("1706.03762v5", {
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer"],
      published: "2017-06-12T17:57:34Z",
      primaryCategory: "cs.CL",
      latestVersion: 7,
    });
    services.searchResults = [
      {
        DOI: "10.3390/app12188972",
        type: "journal-article",
        title: ["Deep Residual Learning for Image Recognition: A Survey"],
        author: [{ given: "Muhammad", family: "Shafiq" }],
        "container-title": ["Applied Sciences"],
        issued: { "date-parts": [[2022, 9, 7]] },
      },
    ];
    const results = await findCitations(
      ["doi:10.1109/cvpr.2016.90", "https://arxiv.org/abs/1706.03762v5", "residual learning survey"],
      sources(),
    );

    expect(results.map((result) => result.outcome)).toEqual(["found", "found", "candidates"]);
    const [resnet, attention, survey] = results;
    expect(resnet?.outcome === "found" && resnet.citation.bibtex).toContain("@inproceedings{he2016deep,");
    expect(attention?.outcome === "found" && attention.citation.bibtex).toBe(
      [
        "@misc{vaswani2017attention,",
        "  author = {Ashish Vaswani and Noam Shazeer},",
        "  title = {Attention Is All You Need},",
        "  year = {2017},",
        "  eprint = {1706.03762v5},",
        "  archivePrefix = {arXiv},",
        "  primaryClass = {cs.CL},",
        "  url = {https://arxiv.org/abs/1706.03762v5}",
        "}",
      ].join("\n"),
    );
    expect(survey?.outcome === "candidates" && survey.candidates.map((candidate) => candidate.key)).toEqual([
      "shafiq2022deep",
    ]);
  });
});
