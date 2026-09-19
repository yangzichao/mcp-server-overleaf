import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject, publishedPaper } from "./support/connectedOverleafProject.js";

/**
 * The same promise the README makes, written so a reader who does not know this codebase can
 * still check it: the feature file states the contract, and every sentence in it is bound to
 * a call against the real server below. A sentence with no binding fails the run, so the
 * document cannot drift away from the behaviour it describes.
 */

const publishedSampleSize = "5000";
const correctedSampleSize = "8000";
const coAuthorSampleSize = "20000";
const rewrittenConclusion = "Our own ending.";

// An absolute path: loadFeature resolves a relative one against its caller, and under
// vitest the caller it sees is the transformed module, not this file.
const feature = await loadFeature(fileURLToPath(new URL("publishingToOverleaf.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply = "";

  AfterEachScenario(async () => {
    await project.close();
  });

  defineSteps(({ When, And, Then, But }) => {
    When("I correct the sample size to 8000", async () => {
      lastReply = await project.client.call("replace_text", {
        path: "main.tex",
        findText: publishedSampleSize,
        replaceWith: correctedSampleSize,
      });
    });

    When("I rewrite the conclusion", async () => {
      lastReply = await project.client.call("edit_section", {
        path: "main.tex",
        sectionTitle: "Conclusion",
        newContent: `\\section{Conclusion}\n${rewrittenConclusion}`,
      });
    });

    When("I delete {string}", async (_context: unknown, path: string) => {
      lastReply = await project.client.call("delete_file", { path });
    });

    When("I move {string} to {string}", async (_context: unknown, fromPath: string, toPath: string) => {
      lastReply = await project.client.call("move_file", { fromPath, toPath });
    });

    And("I push the work as {string}", async (_context: unknown, commitMessage: string) => {
      lastReply = await project.client.call("push_changes", { commitMessage });
    });

    And("I discard the local changes", async () => {
      lastReply = await project.client.call("discard_local_changes");
    });

    And("the co-author publishes a sample size of 20000", async () => {
      await project.remote.collaboratorPushes(
        "main.tex",
        publishedPaper.replace(publishedSampleSize, coAuthorSampleSize),
        "Co-author corrects the sample size",
      );
    });

    And("the co-author publishes a new file {string}", async (_context: unknown, path: string) => {
      await project.remote.collaboratorPushes(path, "Written only by the co-author.\n", `Add ${path}`);
    });

    Then("the pending diff shows the corrected sample size", async () => {
      expect(await project.client.call("show_diff")).toContain(correctedSampleSize);
    });

    But("Overleaf still reports 5000", async () => {
      const published = await project.remote.readPublishedFile("main.tex");
      expect(published).toContain(publishedSampleSize);
      expect(published).not.toContain(correctedSampleSize);
    });

    Then("Overleaf reports the corrected sample size", async () => {
      expect(await project.remote.readPublishedFile("main.tex")).toContain(correctedSampleSize);
    });

    Then("the project reads back the published sample size", async () => {
      expect(await project.client.call("read_file", { path: "main.tex" })).toContain(publishedSampleSize);
    });

    And("there is nothing left to push", async () => {
      expect(await project.client.call("show_diff")).toContain("No local changes pending.");
    });

    Then("the push is refused", () => {
      expect(lastReply).toContain("Push refused");
    });

    Then("the push succeeds", () => {
      expect(lastReply).toContain("Pushed to Overleaf");
    });

    And("Overleaf keeps the co-author's sample size", async () => {
      const published = await project.remote.readPublishedFile("main.tex");
      expect(published).toContain(coAuthorSampleSize);
      expect(published).not.toContain(correctedSampleSize);
    });

    And("the Overleaf history records {string}", async (_context: unknown, subject: string) => {
      expect(await project.remote.publishedCommitSubjects()).toContain(subject);
    });

    And("the Overleaf history does not record {string}", async (_context: unknown, subject: string) => {
      expect(await project.remote.publishedCommitSubjects()).not.toContain(subject);
    });

    And("Overleaf holds the rewritten conclusion", async () => {
      expect(await project.remote.readPublishedFile("main.tex")).toContain(rewrittenConclusion);
    });

    And("Overleaf holds {string}", async (_context: unknown, path: string) => {
      expect(await project.remote.listPublishedFiles()).toContain(path);
    });

    Then("Overleaf no longer holds {string}", async (_context: unknown, path: string) => {
      expect(await project.remote.listPublishedFiles()).not.toContain(path);
    });

    Then("the reply says the file is still in Overleaf", () => {
      expect(lastReply).toContain("still in Overleaf");
    });

    Then("the reply tells me to search for the old path before pushing", () => {
      expect(lastReply).toContain("search_project for it before calling push_changes");
    });
  });

  Background(({ Given }) => {
    Given("the co-author has published a paper reporting a sample size of 5000", async () => {
      project = await ConnectedOverleafProject.open();
      expect(await project.remote.readPublishedFile("main.tex")).toContain(publishedSampleSize);
    });
  });

  Scenario("An edit waits in the clone until it is pushed", () => {});
  Scenario("Pushing publishes the edit and records the reason", () => {});
  Scenario("Discarding local work restores the published version", () => {});
  Scenario("A push that would overwrite the co-author is refused", () => {});
  Scenario("Work that does not collide is rebased onto the co-author's", () => {});
  Scenario("A deleted file stays in Overleaf until the deletion is pushed", () => {});
  Scenario("Pushing a deletion removes the file for everyone", () => {});
  Scenario("Renaming a file warns that LaTeX references are not rewritten", () => {});
});
