import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  FAKE_COLLABORATOR_ID,
  FAKE_REVIEWER_ID,
} from "../../integration/fakeWebRoutes/fakeProjectMembers.js";
import { KNOWN_BUGS_LEFT_OUT } from "../support/knownBugsLeftOut.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";
import { webRequestsMatching } from "./accountProjectLookup.js";

const feature = await loadFeature(fileURLToPath(new URL("projectSettings.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

/** The words the Settings menu uses, and the manage_project argument each one is. */
const SETTING_ARGUMENTS: Record<string, (value: string) => Record<string, unknown>> = {
  compiler: (value) => ({ compiler: value }),
  "TeX Live version": (value) => ({ texLiveImage: value }),
  "main document": (value) => ({ rootDocument: value }),
  "spell check": (value) => ({ spellCheckLanguage: value }),
  "track changes": (value) => ({ trackChanges: parseOnOrOff(value) }),
};

function parseOnOrOff(value: string): boolean {
  if (value !== "on" && value !== "off") throw new Error(`Track changes is "on" or "off", not "${value}".`);
  return value === "on";
}

function settingArgument(setting: string, value: string): Record<string, unknown> {
  const toArgument = SETTING_ARGUMENTS[setting];
  if (!toArgument)
    throw new Error(`Unknown setting "${setting}". Known: ${Object.keys(SETTING_ARGUMENTS).join(", ")}.`);
  return toArgument(value);
}

async function updateSettings(settings: Record<string, unknown>): Promise<void> {
  await scenario.world.callTool("manage_project", { action: "update_settings", ...settings });
}

describeFeature(
  feature,
  ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
    AfterEachScenario(() => scenario.close());

    defineSteps((steps) => {
      defineSharedEditorSteps(steps, scenario);
      const { Given, When, Then, And } = steps;

      Given("Overleaf accepts the track changes switch without keeping it", () => {
        scenario.world.web.settings.ignoreTrackChangesSwitch = true;
      });

      Given("the owner's Overleaf plan does not include track changes", () => {
        scenario.world.editor.hasTrackChangesFeature = false;
      });

      When(
        "I change the project's settings to:",
        async (_context, rows: Array<{ setting: string; value: string }>) => {
          await updateSettings(
            Object.assign({}, ...rows.map((row) => settingArgument(row.setting, row.value))),
          );
        },
      );

      When(
        "I change the project's {string} to {string}",
        async (_context, setting: string, value: string) => {
          await updateSettings(settingArgument(setting, value));
        },
      );

      When("I turn track changes {string} for everyone", async (_context, onOrOff: string) => {
        await updateSettings({ trackChanges: parseOnOrOff(onOrOff) });
      });

      When("I ask to change the project's settings without naming any", async () => {
        await updateSettings({});
      });

      And(
        "Overleaf compiles {string} with {string} on {string}, without spell checking",
        (_context, mainDocument: string, compiler: string, texLiveImage: string) => {
          const { editor } = scenario.world;
          expect(editor.projectSettings).toEqual({
            compiler,
            imageName: texLiveImage,
            spellCheckLanguage: "",
          });
          expect(editor.rootDocumentId).toBe(scenario.world.documentIdOf(mainDocument));
        },
      );

      And("track changes is on for me, each collaborator and guests", () => {
        expect(scenario.world.editor.trackChangesState).toEqual({
          [scenario.world.editor.userId]: true,
          [FAKE_COLLABORATOR_ID]: true,
          [FAKE_REVIEWER_ID]: true,
          __guests__: true,
        });
      });

      And("Overleaf still compiles with {string}", (_context, compiler: string) => {
        expect(scenario.world.editor.projectSettings.compiler).toBe(compiler);
      });

      for (const keyword of [Then, And]) {
        keyword("no settings change was sent to Overleaf", () => {
          const changes = webRequestsMatching(scenario, /\/(settings|track_changes)$/).filter((request) =>
            request.startsWith("POST "),
          );
          expect(changes).toEqual([]);
        });
      }
    });

    Background(() => {});

    Scenario("Several settings change at once, and each is confirmed", () => {});
    Scenario("Track changes is switched for everyone at once, guests included", () => {});
    Scenario("A change Overleaf accepted but did not keep is reported as a failure", () => {});
    ScenarioOutline("A value Overleaf would not take is refused before anything is sent", () => {});
    Scenario("An account that may only review cannot change the settings", () => {});
    Scenario("Without track changes in the owner's plan, nothing else changes either", () => {});
    Scenario("At least one setting is needed", () => {});
  },
  KNOWN_BUGS_LEFT_OUT,
);
