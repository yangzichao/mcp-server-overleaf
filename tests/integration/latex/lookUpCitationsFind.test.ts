import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeMetadataServices } from "../fakeMetadataServices.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * look_up_citations (action find) on the clone, against fake doi.org, Crossref and arXiv: a DOI,
 * an arXiv id and a few words each become BibTeX, with keys the project's .bib files do not use.
 */

const MAIN = "\\begin{document}\n\\cite{he2016deep}\n\\bibliography{refs}\n\\end{document}\n";
const BIBLIOGRAPHY =
  "@inproceedings{he2016deep, title = {Deep Residual Learning for Image Recognition}, author = {He, Kaiming}, year = {2016}, doi = {10.1109/CVPR.2016.90}}\n";
const HE_2016_BIBTEX =
  " @inproceedings{He_2016, title={Deep Residual Learning for Image Recognition}, DOI={10.1109/cvpr.2016.90}, booktitle={CVPR}, author={He, Kaiming and Sun, Jian}, year={2016}, month=June, pages={770–778} }";

let remote: FakeOverleafRemote;
let metadata: FakeMetadataServices;
let client: McpStdioClient | undefined;

beforeEach(async () => {
  remote = await FakeOverleafRemote.create();
  await remote.collaboratorPushes("main.tex", MAIN, "Draft");
  await remote.collaboratorPushes("refs.bib", BIBLIOGRAPHY, "References");
  metadata = await FakeMetadataServices.start();
  metadata.doiBibtex.set("10.1109/cvpr.2016.90", HE_2016_BIBTEX);
  metadata.arxivPapers.set("1706.03762", {
    title: "Attention Is All You Need",
    authors: ["Ashish Vaswani", "Noam Shazeer"],
    published: "2017-06-12T17:57:34Z",
    primaryCategory: "cs.CL",
  });
  metadata.searchResults = [
    {
      DOI: "10.5555/gan",
      type: "proceedings-article",
      title: ["Generative adversarial nets"],
      author: [{ family: "Goodfellow", given: "Ian" }],
      issued: { "date-parts": [[2014]] },
    },
  ];
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

describe("look_up_citations action find", () => {
  it("turns a DOI, an arXiv id and words into BibTeX, avoiding the bibliography's keys", async () => {
    const answer = await (await startClient()).call("look_up_citations", {
      action: "find",
      queries: ["10.1109/cvpr.2016.90", "arXiv:1706.03762", "generative adversarial nets goodfellow"],
    });

    expect(answer).toContain(
      "Looked up 3 queries: 2 found, 1 with matches to choose from, 0 without an entry. Keys avoid those already in refs.bib.",
    );
    expect(answer).toContain(
      '1. "10.1109/cvpr.2016.90" (DOI): found in doi.org.\n@inproceedings{he2016deepb,',
    );
    expect(answer).toContain(
      "This work is already in the bibliography as he2016deep; cite that key rather than adding the entry again.",
    );
    expect(answer).toContain(
      '2. "arXiv:1706.03762" (arXiv id): found in arXiv.\n@misc{vaswani2017attention,',
    );
    expect(answer).toContain(
      '3. "generative adversarial nets goodfellow" (words): 1 match in Crossref, best first.',
    );
    expect(answer).toContain("Match 1:\n@inproceedings{goodfellow2014generative,");

    // The queries go out as given; nothing from the project does.
    expect(metadata.requests.map((request) => request.path).sort()).toEqual([
      "/arxiv/query",
      "/crossref/works",
      "/doi/10.1109/cvpr.2016.90",
    ]);
    const search = metadata.requests.find((request) => request.path === "/crossref/works");
    expect(search?.query.get("query.bibliographic")).toBe("generative adversarial nets goodfellow");
  });

  it("refuses a find without queries, and arguments that belong to the other action, before any lookup", async () => {
    const mcp = await startClient();
    const refusals: Array<[Record<string, unknown>, string]> = [
      [{ action: "find" }, "find needs queries."],
      [
        { action: "find", queries: ["x"], keys: ["he2016deep"] },
        "keys does not apply to find; verify uses it.",
      ],
      [
        { action: "find", queries: ["x"], mainTexFile: "main.tex" },
        "mainTexFile does not apply to find; verify uses it.",
      ],
      [{ queries: ["10.1109/cvpr.2016.90"] }, "queries does not apply to verify; find uses it."],
    ];
    for (const [toolArguments, message] of refusals) {
      const response = await mcp.callRaw("look_up_citations", toolArguments);
      expect(response.result?.isError, JSON.stringify(toolArguments)).toBe(true);
      expect(response.result?.content?.[0]?.text).toBe(message);
    }
    expect(metadata.requests).toEqual([]);
  });
});
