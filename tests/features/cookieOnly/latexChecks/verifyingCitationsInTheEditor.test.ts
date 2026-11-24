import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { FakeMetadataServices } from "../../../integration/fakeMetadataServices.js";
import { defineEditorProjectSteps } from "../../support/editorProjectSteps.js";
import { OverleafEditorScenario } from "../../support/overleafEditorScenario.js";
import { paperWithCitations, registerKnownWorks } from "../../support/paperWithCitations.js";
import { defineSharedEditorSteps } from "../../support/sharedEditorSteps.js";

const feature = await loadFeature(
  fileURLToPath(new URL("verifyingCitationsInTheEditor.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

function publishedContentOf(path: string): string {
  const file = paperWithCitations.find((candidate) => candidate.path === path);
  if (typeof file?.content !== "string") throw new Error(`The paper with citations has no text "${path}".`);
  return file.content;
}

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let metadata: FakeMetadataServices | undefined;

  AfterEachScenario(async () => {
    await scenario.close();
    await metadata?.stop();
    metadata = undefined;
  });

  function catalogues(): FakeMetadataServices {
    if (!metadata) throw new Error("No step of this scenario has started the catalogues.");
    return metadata;
  }

  async function verify(toolArguments: Record<string, unknown> = {}): Promise<void> {
    await scenario.world.callTool("look_up_citations", { action: "verify", ...toolArguments });
    expect(scenario.world.lastReply.isError, scenario.world.lastReply.text).toBe(false);
  }

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    defineEditorProjectSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    Given("the server was given only a session cookie, and the catalogues know some works", async () => {
      metadata = await FakeMetadataServices.start();
      registerKnownWorks(metadata);
      await scenario.open("only a session cookie", metadata.environment());
    });

    And(
      "the project's {string} cites six entries from {string} and one key with no entry",
      (_context, paperPath: string, bibliographyPath: string) => {
        scenario.world.addDocument(paperPath, publishedContentOf("main.tex"));
        scenario.world.addDocument(bibliographyPath, publishedContentOf("refs.bib"));
      },
    );

    Given("the catalogues also know {string} as DOI {string}", (_context, title: string, doi: string) => {
      catalogues().dois.set(doi, { title });
    });

    for (const keyword of [When, And]) {
      keyword("I verify the citations", () => verify());
    }

    When("I verify the citations starting from {string}", (_context, mainTexFile: string) =>
      verify({ mainTexFile }),
    );

    When("I verify only the citations {string}", (_context, keys: string) =>
      verify({ keys: keys.split(", ") }),
    );

    Then("the verdict is {string}", (_context, verdict: string) => {
      expect(scenario.world.lastReply.text.split("\n")[0]).toBe(verdict);
    });

    for (const keyword of [Then, And]) {
      keyword("the confirmed entries are {string}", (_context, entries: string) => {
        const confirmed = scenario.world.lastReply.text
          .split("\n")
          .find((line) => line.startsWith("Confirmed ("));
        expect(confirmed?.replace(/^Confirmed \(\d+\): /, "")).toBe(entries);
      });
    }

    And("no catalogue was asked anything", () => {
      expect(catalogues().requests).toEqual([]);
    });
  });

  Background(() => {});

  Scenario("The entries cited from the main document set in Overleaf's menu are looked up", () => {});
  Scenario("A wrong or unresolvable DOI is flagged with the file and line to fix", () => {});
  Scenario("A DOI corrected in the editor is confirmed at once, with no push", () => {});
  Scenario(
    "A main document named in the call is read instead, and looks nothing up when it cites nothing",
    () => {},
  );
  Scenario("Only the keys asked for are looked up, cited or not", () => {});
});
