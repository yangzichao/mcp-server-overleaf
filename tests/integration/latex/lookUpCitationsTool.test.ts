import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeMetadataServices } from "../fakeMetadataServices.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * look_up_citations through the MCP protocol, against fake doi.org, Crossref and arXiv
 * services: which entries it looks up, how, and what it makes of each answer.
 */

const MAIN = [
  "\\begin{document}",
  "\\cite{real2017,wrongdoi,fakedoi}",
  "\\citep{preprint,searched,madeup,missingkey}",
  "\\bibliography{refs}",
  "\\end{document}",
].join("\n");
const BIBLIOGRAPHY = [
  "@article{real2017, title = {Attention Is All You Need}, doi = {10.5555/real}}",
  "@article{wrongdoi, title = {Deep Residual Learning for Image Recognition}, doi = {10.5555/other}}",
  "@article{fakedoi, title = {A Paper Nobody Wrote}, doi = {10.5555/missing}}",
  "@misc{preprint, title = {Language Models are Few-Shot Learners}, eprint = {2005.14165}, archivePrefix = {arXiv}}",
  "@inproceedings{searched, title = {Generative Adversarial Nets}, author = {Goodfellow, Ian}, year = {2014}}",
  "@article{madeup, title = {Quantum Gravity Explained by Transformers}, author = {Nobody, A.}}",
  "@book{uncited, title = {Never Cited}, doi = {10.5555/uncited}}",
].join("\n");

describe("look_up_citations", () => {
  let remote: FakeOverleafRemote;
  let metadata: FakeMetadataServices;
  let client: McpStdioClient | undefined;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", MAIN, "Draft");
    await remote.collaboratorPushes("refs.bib", BIBLIOGRAPHY, "References");
    metadata = await FakeMetadataServices.start();
    metadata.dois.set("10.5555/real", { title: "Attention is all you need" });
    metadata.dois.set("10.5555/other", { title: "Protein structure prediction" });
    metadata.arxivPapers.set("2005.14165", { title: "Language Models are Few-Shot Learners" });
  });

  afterEach(async () => {
    await client?.stop();
    client = undefined;
    await metadata.stop();
    remote.cleanUp();
  });

  async function startClient(): Promise<McpStdioClient> {
    client = await McpStdioClient.start({ ...remote.environment(), ...metadata.environment() });
    return client;
  }

  it("separates wrong identifiers from unconfirmed titles and confirmed entries", async () => {
    metadata.searchResults = [
      {
        DOI: "10.5555/chapter",
        title: ["Quantum gravity explained"],
        author: [{ family: "Elsewhere", given: "A." }],
        issued: { "date-parts": [[2023]] },
      },
      { DOI: "10.5555/gan", title: ["Generative adversarial nets"], author: [{ family: "Goodfellow" }] },
    ];
    const answer = await (await startClient()).call("look_up_citations", {});

    expect(answer).toContain(
      "Looked up 6 entries from refs.bib: 2 entries point at a missing or different work.",
    );
    expect(answer).toContain(
      'wrongdoi (refs.bib:2): DOI 10.5555/other belongs to "Protein structure prediction", not "Deep Residual Learning for Image Recognition".',
    );
    expect(answer).toContain(
      "fakedoi (refs.bib:3): DOI 10.5555/missing does not resolve; doi.org has no such DOI.",
    );
    expect(answer).toContain(
      'madeup (refs.bib:6): no work titled "Quantum Gravity Explained by Transformers" by Nobody found in Crossref. The closest Crossref result is "Quantum gravity explained" by Elsewhere (2023).',
    );
    expect(answer).toContain(
      "Confirmed (3): real2017 (DOI), preprint (arXiv id), searched (found in Crossref as DOI 10.5555/gan)",
    );
    expect(answer).toContain("No entry in any bibliography file for: missingkey.");

    const doiRequests = metadata.requests.filter((request) => request.path.startsWith("/doi/"));
    expect(doiRequests.map((request) => request.path)).not.toContain("/doi/10.5555/uncited");
    for (const request of metadata.requests) {
      expect(request.userAgent).toMatch(/^mcp-server-overleaf\/\S+ \(\+https:\/\/github\.com\//);
      expect(request.userAgent).not.toContain("@");
    }
    const search = metadata.requests.find((request) => request.path === "/crossref/works");
    expect(search?.query.get("query.bibliographic")).toBe("generative adversarial nets Goodfellow 2014");
  });

  it("looks up only the keys asked for, cited or not, and stops at maximumEntries", async () => {
    metadata.dois.set("10.5555/uncited", { title: "Never cited" });
    const mcp = await startClient();
    const byKey = await mcp.call("look_up_citations", { keys: ["uncited", "nosuchkey"] });
    expect(byKey).toContain("Looked up 1 entry from refs.bib: no entry points at the wrong work.");
    expect(byKey).toContain("Confirmed (1): uncited (DOI)");
    expect(byKey).toContain("No entry in any bibliography file for: nosuchkey.");

    const limited = await mcp.call("look_up_citations", { maximumEntries: 1 });
    expect(limited).toContain("Confirmed (1): real2017 (DOI)");
    expect(limited).toContain("5 more entries were not looked up");
  });
});
