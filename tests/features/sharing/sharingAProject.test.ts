import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { FAKE_PENDING_INVITES } from "../../integration/fakeWebRoutes/fakeProjectMembers.js";
import { type ElicitationAnswer, PersonAtTheClient } from "../../integration/support/personAtTheClient.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("sharingAProject.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();
let me = new PersonAtTheClient();

const ANSWERS: Readonly<Record<string, ElicitationAnswer>> = {
  decline: { action: "decline" },
  dismiss: { action: "cancel" },
  "accept with the box unticked": { action: "accept", content: { confirm: false } },
};

function lastQuestion() {
  const question = me.questions.at(-1);
  if (!question) throw new Error("My MCP client has asked me nothing in this scenario.");
  return question;
}

const PRIVILEGE_LEVEL_OF_VERB: Readonly<Record<string, string>> = {
  edit: "readAndWrite",
  review: "review",
  view: "readOnly",
};

function privilegeLevelOf(verb: string): string {
  const level = PRIVILEGE_LEVEL_OF_VERB[verb];
  if (!level) throw new Error(`Unknown access "${verb}". Known: edit, review, view.`);
  return level;
}

function currentMembers() {
  const { editor } = scenario.world;
  return editor.sharing.ownerAndMembers(editor.userId, editor.permissionsLevel).members;
}

function sharingChangesSent(): string[] {
  return scenario.world.web.requests
    .filter(
      (request) =>
        request.method !== "GET" && /^\/project\/[0-9a-f]{24}\/(invite|users)(\/|$)/i.test(request.path),
    )
    .map((request) => `${request.method} ${request.path}`);
}

function addressOf(projectName: string): string {
  const project = scenario.world.account.projects.find((candidate) => candidate.name === projectName);
  if (!project) throw new Error(`The account holds no project "${projectName}".`);
  return `${scenario.world.editor.baseUrl}/project/${project._id}`;
}

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    Given("I am signed in to Overleaf from an MCP client that can ask me to confirm", async () => {
      me = new PersonAtTheClient();
      await scenario.open(undefined, {}, { personAtTheClient: me });
    });

    Given("I will answer what my MCP client asks me with {string}", (_context, answer: string) => {
      const chosen = ANSWERS[answer];
      if (!chosen) throw new Error(`Unknown answer "${answer}". Known: ${Object.keys(ANSWERS).join(", ")}.`);
      me.nextAnswer = chosen;
    });

    Given("my MCP client cannot ask me anything", async () => {
      await scenario.world.switchClient({});
    });

    And(
      `Ada can edit the project, Bea can review it, and {string} has a pending invitation to edit it`,
      (_context, invitedEmail: string) => {
        expect(currentMembers().map((member) => [member.email, member.privileges])).toEqual([
          ["ada@example.com", "readAndWrite"],
          ["bea@example.com", "review"],
        ]);
        expect(scenario.world.editor.sharing.invites).toEqual([
          expect.objectContaining({ email: invitedEmail, privileges: "readAndWrite" }),
        ]);
      },
    );

    for (const keyword of [Given, And]) {
      keyword("the owner's plan has no editor or reviewer seat left", () => {
        const { sharing } = scenario.world.editor;
        const taken = [...currentMembers(), ...sharing.invites].filter((entry) =>
          sharing.takesSeat(entry.privileges),
        ).length;
        sharing.collaboratorSeats = taken;
      });
    }

    Given("overleaf.com's bot protection holds back invitations", () => {
      scenario.world.editor.sharing.answerInvitesAsBotProtection = true;
    });

    Given("{string} can only view the project", (_context, email: string) => {
      const member = currentMembers().find((candidate) => candidate.email === email);
      if (!member) throw new Error(`${email} is not a member of the fake project.`);
      scenario.world.editor.sharing.changedPrivileges.set(member._id, "readOnly");
    });

    When("I invite {string} to {word} the project", async (_context, email: string, verb: string) => {
      await scenario.world.callTool("manage_project", { action: "invite", email, accessLevel: verb });
    });

    When("I invite {string} to view {string}", async (_context, email: string, projectName: string) => {
      await scenario.world.callTool("manage_project", {
        action: "invite",
        project: addressOf(projectName),
        email,
        accessLevel: "view",
      });
    });

    When("I change the access of {string} to {string}", async (_context, email: string, verb: string) => {
      await scenario.world.callTool("manage_project", { action: "set_access", email, accessLevel: verb });
    });

    When("I remove {string} from the project", async (_context, email: string) => {
      await scenario.world.callTool("manage_project", { action: "remove_member", email });
    });

    When("I withdraw the invitation to {string}", async (_context, email: string) => {
      await scenario.world.callTool("manage_project", { action: "revoke_invite", email });
    });

    for (const keyword of [Then, And]) {
      keyword(
        "{string} has a pending invitation to {word} the project",
        (_context, email: string, verb: string) => {
          expect(scenario.world.editor.sharing.invites).toContainEqual(
            expect.objectContaining({ email, privileges: privilegeLevelOf(verb) }),
          );
        },
      );

      keyword("{string} can {word} the project", (_context, email: string, verb: string) => {
        const member = currentMembers().find((candidate) => candidate.email === email);
        expect(member?.privileges).toBe(privilegeLevelOf(verb));
      });

      keyword("Overleaf was sent no change to who the project is shared with", () => {
        expect(sharingChangesSent()).toEqual([]);
      });
    }

    Then("my MCP client asked me {string}", (_context, message: string) => {
      expect(me.questions).toHaveLength(1);
      expect(lastQuestion()).toEqual(expect.objectContaining({ mode: "form", message }));
    });

    And("the question had one box to tick, {string}", (_context, title: string) => {
      expect(lastQuestion().requestedSchema).toEqual({
        type: "object",
        properties: { confirm: { type: "boolean", title } },
        required: ["confirm"],
      });
    });

    And("my MCP client asked me nothing", () => {
      expect(me.questions).toEqual([]);
    });

    And("Overleaf was sent no invitation", () => {
      expect(sharingChangesSent().filter((request) => request.endsWith("/invite"))).toEqual([]);
    });

    And("nobody new has a pending invitation", () => {
      expect(scenario.world.editor.sharing.invites).toEqual(FAKE_PENDING_INVITES);
    });

    for (const keyword of [Then, And]) {
      keyword("nobody has a pending invitation", () => {
        expect(scenario.world.editor.sharing.invites).toEqual([]);
      });
    }

    And("{string} is no longer a member of the project", (_context, email: string) => {
      expect(currentMembers().map((member) => member.email)).not.toContain(email);
    });
  });

  Background(() => {});
  Scenario("An invitation goes out once I confirm it in my MCP client", () => {});
  ScenarioOutline("An invitation I do not confirm is not sent", () => {});
  Scenario("An MCP client that cannot ask me sends me to the Share menu", () => {});
  Scenario("The address is matched as Overleaf stores it, without case or spaces", () => {});
  Scenario("Someone who is already a member is not invited again, and I am not asked", () => {});
  Scenario("Someone already invited is not invited twice", () => {});
  Scenario("A plan with no seat left is reported, and a viewer still fits", () => {});
  ScenarioOutline("Anything but one bare address is refused before Overleaf is asked", () => {});
  Scenario("An address Overleaf does not accept is reported as such", () => {});
  Scenario("Bot protection that wants a captcha sends me to the Share menu", () => {});
  Scenario("Lowering a member's access asks me nothing", () => {});
  Scenario("Giving a member more access waits until I confirm it", () => {});
  Scenario("More access I decline is not given", () => {});
  Scenario("An MCP client that cannot ask me still takes access away, and nothing more", () => {});
  Scenario("Asking for the access a member already has changes nothing", () => {});
  Scenario("Giving a viewer edit access needs a seat on the owner's plan", () => {});
  Scenario("An invitation not yet accepted has no access level to change", () => {});
  Scenario("A member is removed without asking me", () => {});
  Scenario("A pending invitation is withdrawn", () => {});
  Scenario("A member is removed, not withdrawn, and an invitation withdrawn, not removed", () => {});
  Scenario("Someone who is neither a member nor invited is named as such", () => {});
  ScenarioOutline("Only the owner changes who a project is shared with", () => {});
});
