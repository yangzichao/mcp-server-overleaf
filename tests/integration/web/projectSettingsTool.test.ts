import { describe, expect, it } from "vitest";
import { FAKE_COLLABORATOR_ID, FAKE_REVIEWER_ID } from "../fakeWebRoutes/fakeProjectMembers.js";
import { PAPER, useEditorTestHarness } from "../support/editorTestHarness.js";
import { responseText } from "../support/mcpProtocol.js";

/**
 * manage_project's update_settings: checked before anything is sent, then confirmed through a
 * fresh editor connection, so a change Overleaf accepted but did not keep is reported.
 */

describe("changing a project's settings", () => {
  const harness = useEditorTestHarness();

  function settingsRequests(): number {
    return harness.editor.web.requests.filter(
      (request) => request.method === "POST" && /\/(settings|track_changes)$/.test(request.path),
    ).length;
  }

  it("changes the compiler, TeX Live version, main document and spell check, and confirms each", async () => {
    const thesisId = harness.editor.addDocument("thesis.tex", PAPER);
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "update_settings",
      compiler: "xelatex",
      texLiveImage: "texlive-full:2024.1",
      rootDocument: "thesis.tex",
      spellCheckLanguage: "off",
    });
    expect(answer).toBe(
      'Changed the settings of "Fake paper": compiler xelatex, TeX Live image texlive-full:2024.1, main document thesis.tex, spell check off. A fresh connection to the project confirms each change.',
    );
    expect(harness.editor.projectSettings).toEqual({
      compiler: "xelatex",
      imageName: "texlive-full:2024.1",
      spellCheckLanguage: "",
    });
    expect(harness.editor.rootDocumentId).toBe(thesisId);
  });

  it("turns track changes on for everyone, guests included", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", { action: "update_settings", trackChanges: true });
    expect(answer).toBe(
      'Changed the settings of "Fake paper": track changes on for everyone. A fresh connection to the project confirms each change.',
    );
    expect(harness.editor.trackChangesState).toEqual({
      [harness.editor.userId]: true,
      [FAKE_COLLABORATOR_ID]: true,
      [FAKE_REVIEWER_ID]: true,
      __guests__: true,
    });

    const turnedOff = await client.call("manage_project", { action: "update_settings", trackChanges: false });
    expect(turnedOff).toBe(
      'Changed the settings of "Fake paper": track changes off for everyone. A fresh connection to the project confirms each change.',
    );
  });

  it("reports a change Overleaf accepted but a fresh connection does not show", async () => {
    harness.editor.web.settings.ignoreTrackChangesSwitch = true;
    const client = await harness.startClient();
    const response = await client.callRaw("manage_project", {
      action: "update_settings",
      compiler: "lualatex",
      trackChanges: true,
    });
    expect(response.result?.isError).toBe(true);
    const text = responseText(response);
    expect(text).toContain(
      'Overleaf accepted the settings change to "Fake paper", but a fresh connection to the project does not show all of it.',
    );
    expect(text).toContain("In effect now: compiler lualatex.");
    expect(text).toContain("Not in effect: track changes on for everyone (the project reports off).");
  });

  it("refuses a TeX Live version this account cannot use, listing the ones it can, and sends nothing", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "update_settings",
      texLiveImage: "texlive-full:2017.1",
    });
    expect(answer).toContain('"texlive-full:2017.1" is not a TeX Live version this account can use.');
    expect(answer).toContain("texlive-full:2025.1 (TeX Live 2025)");
    expect(settingsRequests()).toBe(0);
  });

  it("refuses a spell-check language Overleaf does not offer, and sends nothing", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "update_settings",
      spellCheckLanguage: "fr",
    });
    expect(answer).toBe('"fr" is not a spell-check language Overleaf offers. It offers: en, en_GB, de.');
    expect(settingsRequests()).toBe(0);
  });

  it("refuses a main document that is not a .tex file, and sends nothing", async () => {
    harness.editor.addDocument("refs.bib", "@article{a, title={A}}");
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "update_settings",
      rootDocument: "refs.bib",
    });
    expect(answer).toBe(
      "refs.bib cannot be the main document: Overleaf accepts .tex, .Rtex, .ltx and .Rnw files.",
    );
    expect(settingsRequests()).toBe(0);
  });

  it("refuses a main document that does not exist, naming the documents that do", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "update_settings",
      rootDocument: "missing.tex",
      compiler: "xelatex",
    });
    expect(answer).toBe(
      'No editable document at "missing.tex" in this project. Editable documents: main.tex.',
    );
    expect(settingsRequests()).toBe(0);
  });

  it("refuses an account without edit access before sending anything", async () => {
    harness.editor.permissionsLevel = "review";
    const client = await harness.startClient();
    const answer = await client.call("manage_project", { action: "update_settings", compiler: "xelatex" });
    expect(answer).toContain(
      'This account can review "Fake paper", and changing its settings needs edit access.',
    );
    expect(settingsRequests()).toBe(0);
  });

  it("refuses track changes when the owner's plan lacks it, and changes nothing else either", async () => {
    harness.editor.hasTrackChangesFeature = false;
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "update_settings",
      compiler: "xelatex",
      trackChanges: true,
    });
    expect(answer).toContain("Track changes is not part of the project owner's Overleaf plan");
    expect(harness.editor.projectSettings.compiler).toBe("pdflatex");
    expect(settingsRequests()).toBe(0);
  });

  it("needs at least one setting, and refuses settings with other actions", async () => {
    const client = await harness.startClient();
    expect(await client.call("manage_project", { action: "update_settings" })).toBe(
      "update_settings needs at least one of compiler, rootDocument, spellCheckLanguage, texLiveImage or trackChanges.",
    );
    expect(await client.call("manage_project", { action: "archive", trackChanges: true })).toBe(
      "trackChanges does not apply to archive; update_settings uses it.",
    );
    expect(
      await client.call("manage_project", {
        action: "update_settings",
        compiler: "xelatex",
        saveTo: "/tmp/a.zip",
      }),
    ).toBe("saveTo does not apply to update_settings; download_zip uses it.");
    const badCompiler = await client.call("manage_project", {
      action: "update_settings",
      compiler: "context",
    });
    expect(badCompiler).toContain("Input validation error");
  });
});
