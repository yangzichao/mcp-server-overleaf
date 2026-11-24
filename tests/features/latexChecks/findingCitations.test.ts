import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { FakeMetadataServices } from "../../integration/fakeMetadataServices.js";
import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const paperCitingHe2016 = "\\begin{document}\n\\cite{he2016deep}\n\\bibliography{refs}\n\\end{document}\n";
const bibliographyWithHe2016 =
  "@inproceedings{he2016deep, title = {Deep Residual Learning for Image Recognition}, author = {He, Kaiming}, year = {2016}, doi = {10.1109/CVPR.2016.90}}\n";
const he2016BibtexFromDoiOrg =
  " @inproceedings{He_2016, title={Deep Residual Learning for Image Recognition}, DOI={10.1109/cvpr.2016.90}, booktitle={CVPR}, author={He, Kaiming and Sun, Jian}, year={2016}, month=June, pages={770–778} }";

const feature = await loadFeature(fileURLToPath(new URL("findingCitations.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let metadata: FakeMetadataServices;
  let lastReply: ToolReply;
  let lastQuery = "";

  AfterEachScenario(async () => {
    await project.close();
    await metadata.stop();
  });

  async function find(queries: string[]): Promise<void> {
    lastQuery = queries[0] ?? "";
    lastReply = await callTool(project.client, "look_up_citations", { action: "find", queries });
  }

  defineSteps(({ Step, When, Then, And }) => {
    // A Scenario Outline matches its steps by keyword, so the ones it uses cannot be plain Step.
    When("I look up {string}", async (_context: unknown, query: string) => {
      await find([query]);
    });

    Step("I look up {string}, {string} and {string}", async (_context: unknown, ...queries: string[]) => {
      await find(queries);
    });

    Step("I ask to find citations without any query", async () => {
      lastReply = await callTool(project.client, "look_up_citations", { action: "find" });
    });

    Then(
      "the query is read as a {string} and {string}",
      (_context: unknown, kind: string, outcome: string) => {
        expect(lastReply.text).toContain(`1. "${lastQuery}" (${kind}): ${outcome}.`);
      },
    );

    And("the reply offers an entry starting {string}", (_context: unknown, entryStart: string) => {
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text.split("\n")).toContain(entryStart);
    });

    Step("the reply starts with {string}", (_context: unknown, firstLine: string) => {
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text.startsWith(firstLine), lastReply.text).toBe(true);
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.text).toContain(expected);
    });

    Step("exactly one lookup went to each of doi.org, arXiv and Crossref", () => {
      expect(metadata.requests.map((request) => request.path).sort()).toEqual([
        "/arxiv/query",
        "/crossref/works",
        "/doi/10.1109/cvpr.2016.90",
      ]);
    });

    Step("Crossref was asked for {string} and nothing else", (_context: unknown, words: string) => {
      const search = metadata.requests.find((request) => request.path === "/crossref/works");
      expect(search?.query.get("query.bibliographic")).toBe(words);
    });

    Step("the reply is an error that says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.isError, lastReply.text).toBe(true);
      expect(lastReply.text).toBe(expected);
    });

    Step("nothing is pending in the project", async () => {
      expect(await project.client.call("read_project", { view: "changes" })).toBe(
        "No local changes pending.",
      );
    });

    Step("no lookup was made", () => {
      expect(metadata.requests).toEqual([]);
    });
  });

  Background(({ Given, And }) => {
    Given(`the paper cites "he2016deep" from "refs.bib", whose DOI is 10.1109/CVPR.2016.90`, async () => {
      metadata = await FakeMetadataServices.start();
      project = await ConnectedOverleafProject.openWith({
        publishedFiles: [
          { path: "main.tex", content: paperCitingHe2016, commitMessage: "Draft" },
          { path: "refs.bib", content: bibliographyWithHe2016, commitMessage: "References" },
        ],
        environmentOverrides: () => metadata.environment(),
      });
    });

    And("the catalogues know that DOI, the arXiv paper 1706.03762 and a Crossref work by Goodfellow", () => {
      metadata.doiBibtex.set("10.1109/cvpr.2016.90", he2016BibtexFromDoiOrg);
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
  });

  ScenarioOutline("Each kind of query is looked up where it belongs", () => {});
  Scenario("Several queries are answered in one call, with a summary first", () => {});
  Scenario("A work already in the bibliography points at the key it has", () => {});
  Scenario("Only the queries leave this computer", () => {});
  Scenario("Finding needs something to look up", () => {});
});
