import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import type { FakeOverleafRemote } from "../../integration/fakeOverleafRemote.js";
import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { readSiblingProjectFile } from "../support/siblingProjectFiles.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const thesisProjectId = "71c4d5e6f7a8b9c0d1e2f3a4";
const unregisteredProjectId = "82d5e6f7a8b9c0d1e2f3a4b5";

const originalTextByProjectName: Record<string, string> = {
  paper: "The paper.",
  thesis: "The thesis.",
};

function registeredProjectsEnvironment(remote: FakeOverleafRemote): NodeJS.ProcessEnv {
  return { OVERLEAF_PROJECTS: `paper=${remote.projectId},thesis=${thesisProjectId}` };
}

function revised(text: string): string {
  return text.replace(".", ", revised.");
}

const feature = await loadFeature(fileURLToPath(new URL("addressingProjects.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
  });

  function projectArgumentFor(paper: string, form: string): string {
    if (paper === "thesis" && form === "registered name") return "thesis";
    if (paper === "unregistered one" && form === "Overleaf address") {
      return `https://www.overleaf.com/project/${unregisteredProjectId}`;
    }
    if (paper === "unregistered one" && form === "24-character id") return unregisteredProjectId;
    throw new Error(`No way to name the ${paper} by its ${form}`);
  }

  async function publishedMainFileOf(projectName: string): Promise<string> {
    return projectName === "paper"
      ? await project.remote.readPublishedFile("main.tex")
      : await readSiblingProjectFile(project.remote, thesisProjectId, "main.tex");
  }

  defineSteps(({ Step }) => {
    Step("I list the projects", async () => {
      lastReply = await callTool(project.client, "list_projects");
    });

    Step("I read {string} without naming a project", async (_context: unknown, path: string) => {
      lastReply = await callTool(project.client, "read_file", { path });
    });

    Step(
      "I read {string} from the project {string}",
      async (_context: unknown, path: string, name: string) => {
        lastReply = await callTool(project.client, "read_file", { project: name, path });
      },
    );

    Step(
      "I edit {string} in {string} and in {string}",
      async (_context: unknown, path: string, ...names: string[]) => {
        for (const name of names) {
          const original = originalTextByProjectName[name] ?? "";
          await project.client.call("edit_file", {
            action: "replace_text",
            project: name,
            path,
            findText: original,
            replaceWith: revised(original),
          });
        }
      },
    );

    Step("I discard the local changes in {string}", async (_context: unknown, name: string) => {
      await project.client.call("manage_files", { action: "discard_local_changes", project: name });
    });

    Step("I push {string} as {string}", async (_context: unknown, name: string, commitMessage: string) => {
      await project.client.call("push_changes", { project: name, commitMessage });
    });

    Step("the server is restarted with no default project", async () => {
      await project.restartServer(registeredProjectsEnvironment(project.remote));
    });

    Step("the list shows {string} and {string}", (_context: unknown, ...entries: string[]) => {
      for (const entry of entries) expect(lastReply.text.split("\n")).toContain(entry);
    });

    Step("the list says any other project can be given by its Overleaf address", () => {
      expect(lastReply.text).toContain("give its Overleaf address as `project`");
    });

    Step("the reply is {string}", (_context: unknown, content: string) => {
      expect(lastReply.text).toBe(`${content}\n`);
    });

    Step(
      "the call fails, naming {string} as unknown and {string} as the configured projects",
      (_context: unknown, name: string, configured: string) => {
        expect(lastReply.isError).toBe(true);
        expect(lastReply.text).toContain(`Unknown project "${name}". Configured projects: ${configured}.`);
      },
    );

    Step("the failure says a paper can be named {string}", (_context: unknown, ways: string) => {
      expect(lastReply.text).toContain(ways);
    });

    Step("the call fails with {string}", (_context: unknown, reason: string) => {
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(reason);
    });

    Step("{string} has nothing pending", async (_context: unknown, name: string) => {
      expect(await project.client.call("read_project", { view: "changes", project: name })).toBe(
        "No local changes pending.",
      );
    });

    Step("{string} still has its edit pending", async (_context: unknown, name: string) => {
      const revisedText = revised(originalTextByProjectName[name] ?? "");
      expect(await project.client.call("read_project", { view: "changes", project: name })).toContain(
        `+${revisedText}`,
      );
    });

    Step("Overleaf holds the edit in {string}", async (_context: unknown, name: string) => {
      expect(await publishedMainFileOf(name)).toContain(revised(originalTextByProjectName[name] ?? ""));
    });

    Step("Overleaf does not hold the edit in {string}", async (_context: unknown, name: string) => {
      expect(await publishedMainFileOf(name)).toBe(`${originalTextByProjectName[name]}\n`);
    });
  });

  Background(({ Given, And }) => {
    Given(
      "the account has the registered papers {string} and {string}, with {string} as the default",
      async () => {
        project = await ConnectedOverleafProject.openWith({
          publishedFiles: [{ path: "main.tex", content: "The paper.\n", commitMessage: "Initial draft" }],
          prepareRemote: async (remote) => {
            await remote.addSiblingProject(thesisProjectId, "main.tex", "The thesis.\n");
          },
          environmentOverrides: (remote) => ({
            ...registeredProjectsEnvironment(remote),
            OVERLEAF_DEFAULT_PROJECT: "paper",
          }),
        });
      },
    );
    And("it also has a paper nobody registered", async () => {
      await project.remote.addSiblingProject(unregisteredProjectId, "main.tex", "The other paper.\n");
    });
  });

  Scenario("The project list marks the default and says other papers can be named by address", () => {});
  Scenario("A call that names no project uses the default", () => {});

  ScenarioOutline("A paper can be named in every form a person has to hand", ({ When, Then }, variables) => {
    When(`I read "main.tex" from the <paper> named by its <form>`, async () => {
      lastReply = await callTool(project.client, "read_file", {
        project: projectArgumentFor(variables.paper, variables.form),
        path: "main.tex",
      });
    });
    Then(`the reply is "<content>"`, () => {
      expect(lastReply.text).toBe(`${variables.content}\n`);
    });
  });

  Scenario("A name that matches nothing is refused with the ways to name a paper", () => {});
  Scenario("Discarding the work in one paper keeps the work in the other", () => {});
  Scenario("Pushing one paper publishes only that paper", () => {});
  Scenario("With several papers and no default, a call must name one", () => {});
});
