import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { FakeMetadataServices } from "../../integration/fakeMetadataServices.js";
import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { paperWithCitations, registerKnownWorks } from "../support/paperWithCitations.js";

const feature = await loadFeature(fileURLToPath(new URL("verifyingCitations.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let metadata: FakeMetadataServices;
  let lastReply = "";

  AfterEachScenario(async () => {
    await project.close();
    await metadata.stop();
  });

  async function verify(toolArguments: Record<string, unknown> = {}): Promise<void> {
    lastReply = await project.client.call("look_up_citations", toolArguments);
  }

  defineSteps(({ Step }) => {
    Step("I verify the citations", async () => {
      await verify();
    });

    Step("I verify only the citations {string}", async (_context: unknown, keys: string) => {
      await verify({ keys: keys.split(", ") });
    });

    Step("I verify at most {int} citation", async (_context: unknown, maximumEntries: number) => {
      await verify({ maximumEntries });
    });

    Step("the verdict is {string}", (_context: unknown, verdict: string) => {
      expect(lastReply.split("\n")[0]).toBe(verdict);
    });

    Step(
      "{string} is flagged because its DOI belongs to {string}",
      (_context: unknown, key: string, otherTitle: string) => {
        expect(lastReply).toMatch(
          new RegExp(`${key} \\(refs\\.bib:\\d+\\): DOI \\S+ belongs to "${otherTitle}"`),
        );
      },
    );

    Step("{string} is flagged because doi.org has no such DOI", (_context: unknown, key: string) => {
      expect(lastReply).toMatch(
        new RegExp(`${key} \\(refs\\.bib:\\d+\\): DOI \\S+ does not resolve; doi.org has no such DOI\\.`),
      );
    });

    Step(
      "{string} is reported as not found in Crossref, closest match {string}",
      (_context: unknown, key: string, closestTitle: string) => {
        const line = lastReply.split("\n").find((entry) => entry.includes(`${key} (refs.bib:`)) ?? "";
        expect(line).toContain("found in Crossref");
        expect(line).toContain(`The closest Crossref result is "${closestTitle}"`);
      },
    );

    Step("the confirmed entries are {string}", (_context: unknown, entries: string) => {
      expect(lastReply).toMatch(
        new RegExp(`Confirmed \\(\\d+\\): ${entries.replace(/[()\\.]/g, "\\$&")}$`, "m"),
      );
    });

    Step(
      "the reply names {string} as having no entry in any bibliography file",
      (_context: unknown, key: string) => {
        expect(lastReply).toContain(`No entry in any bibliography file for: ${key}.`);
      },
    );

    Step("no lookup was made for the DOI of {string}", () => {
      expect(metadata.requests.map((request) => request.path)).not.toContain("/doi/10.5555/uncited");
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply).toContain(expected);
    });

    Step(
      "every lookup's user agent names mcp-server-overleaf and contains no {string}",
      (_context, forbidden: string) => {
        expect(metadata.requests.length).toBeGreaterThan(0);
        for (const request of metadata.requests) {
          expect(request.userAgent).toMatch(/^mcp-server-overleaf\/\S+ /);
          expect(request.userAgent).not.toContain(forbidden);
        }
      },
    );
  });

  Background(({ Given, And }) => {
    Given("the paper cites six entries from {string} and one key with no entry", async () => {
      metadata = await FakeMetadataServices.start();
      project = await ConnectedOverleafProject.openWith({
        publishedFiles: paperWithCitations,
        environment: () => metadata.environment(),
      });
    });
    And("the catalogues know some of those works", () => {
      registerKnownWorks(metadata);
    });
  });

  Scenario("A DOI that belongs to a different work is flagged", () => {});
  Scenario("A DOI that does not resolve is flagged", () => {});
  Scenario("A title no catalogue knows is reported with the closest match", () => {});
  Scenario("Entries confirmed by DOI, arXiv id or title search are listed as confirmed", () => {});
  Scenario("A cited key with no bibliography entry is named", () => {});
  Scenario("An entry nobody cites is not looked up unless asked for by key", () => {});
  Scenario("Lookups stop at the requested number of entries", () => {});
  Scenario("Every lookup names the server and carries no email address", () => {});
});
