import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { unfilledBundlePlaceholder } from "../../support/bundlePlaceholder.js";
import { callTool, type ToolReply } from "../support/toolReply.js";
import { UnconfiguredServer } from "../support/unconfiguredServer.js";

const missingTokenMessage = "OVERLEAF_GIT_TOKEN is not set";
const setupCommand = "npx mcp-server-overleaf setup";
const bundleProjectAddress = "https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1";

const minimalArgumentsByTool: Record<string, Record<string, unknown>> = {
  list_projects: {},
  read_project: {},
  read_file: { path: "main.tex" },
  edit_file: { action: "replace_text", path: "main.tex", findText: "5000", replaceWith: "8000" },
  push_changes: { commitMessage: "Never pushed" },
  read_history: {},
};

const unfilledTokenByDescription: Record<string, { token: string; cookie: string }> = {
  empty: { token: "", cookie: "" },
  "as its placeholder": {
    token: unfilledBundlePlaceholder("overleaf_git_token"),
    cookie: unfilledBundlePlaceholder("overleaf_session_cookie"),
  },
};

const feature = await loadFeature(fileURLToPath(new URL("unconfiguredServer.feature", import.meta.url)));

describeFeature(feature, ({ Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  let server: UnconfiguredServer;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await server.close();
  });

  async function startWithNoCredentials(): Promise<void> {
    server = await UnconfiguredServer.start();
  }

  function expectMissingTokenFailure(): void {
    expect(lastReply.isError).toBe(true);
    expect(lastReply.text).toContain(missingTokenMessage);
  }

  defineSteps(({ Step }) => {
    Step("the server was started with no credentials at all", startWithNoCredentials);

    Step("these tools are offered:", async (_context: unknown, rows: Array<{ tool: string }>) => {
      expect(await server.client.listToolNames()).toEqual(
        expect.arrayContaining(rows.map((row) => row.tool)),
      );
    });

    Step("the server's error output names the missing token", () => {
      expect(server.client.stderr).toContain(missingTokenMessage);
    });

    Step("I read {string} from {string}", async (_context: unknown, path: string, project: string) => {
      lastReply = await callTool(server.client, "read_file", { path, project });
    });

    Step("the call fails, naming the missing token", expectMissingTokenFailure);
  });

  Scenario("The tools are offered even with no credentials", () => {});

  ScenarioOutline(
    "Every call names the missing token and how to set it up",
    ({ Given, When, Then }, variables) => {
      Given("the server was started with no credentials at all", startWithNoCredentials);
      When("I call <tool>", async () => {
        lastReply = await callTool(server.client, variables.tool, minimalArgumentsByTool[variables.tool]);
      });
      Then("the reply names the missing token and how to set it up", () => {
        expect(lastReply.text).toContain(missingTokenMessage);
        expect(lastReply.text).toContain(setupCommand);
      });
    },
  );

  Scenario("Naming a project by its address does not get around the missing token", () => {});

  ScenarioOutline(
    "A desktop bundle with only the project address filled in explains itself",
    ({ Given, When, Then }, variables) => {
      Given("the server was started from the desktop bundle with the token left <unfilled>", async () => {
        const unfilled = unfilledTokenByDescription[variables.unfilled];
        if (!unfilled) throw new Error(`No unfilled token described as "${variables.unfilled}"`);
        server = await UnconfiguredServer.start({
          OVERLEAF_PROJECT_ID: bundleProjectAddress,
          OVERLEAF_GIT_TOKEN: unfilled.token,
          OVERLEAF_SESSION_COOKIE: unfilled.cookie,
        });
      });
      When(`I read "main.tex" from the configured project`, async () => {
        lastReply = await callTool(server.client, "read_file", { path: "main.tex" });
      });
      Then("the call fails, naming the missing token", expectMissingTokenFailure);
    },
  );
});
