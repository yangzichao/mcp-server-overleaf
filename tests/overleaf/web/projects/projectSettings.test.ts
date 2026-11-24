import { describe, expect, it } from "vitest";

import { RequestNotSentError } from "../../../../src/overleaf/web/overleafWebErrors.js";
import { fetchProjectSettingChoices } from "../../../../src/overleaf/web/projects/projectSettingChoices.js";
import { updateProjectSettings } from "../../../../src/overleaf/web/projects/projectSettings.js";
import { failureOf, statusOf } from "../support/failureOf.js";
import { useFakeOverleafConnection } from "../support/fakeOverleafConnection.js";

const INTRODUCTION_ID = "d0c000000000000000000002";

describe("changing a project's settings", () => {
  const connection = useFakeOverleafConnection();
  const update = (change: Parameters<typeof updateProjectSettings>[2]) =>
    updateProjectSettings(connection.client(), connection.overleaf.projectId, change);

  it("sets the compiler, lower-cased as Overleaf stores it, and the editor sees it", async () => {
    await update({ compiler: " XeLaTeX " });
    expect((await connection.joinProject()).details.compiler).toBe("xelatex");
  });

  it("refuses a compiler Overleaf does not offer before sending anything", async () => {
    const failure = await failureOf(update({ compiler: "context" }));
    expect(failure).toBeInstanceOf(RequestNotSentError);
    expect(failure.message).toContain("pdflatex, latex, xelatex, lualatex");
    expect(connection.changesSentTo(/settings/)).toEqual([]);
  });

  it("makes another .tex document the main one, and refuses a file that cannot be", async () => {
    await update({ rootDocument: { documentId: INTRODUCTION_ID, path: "sections/introduction.tex" } });
    expect((await connection.joinProject()).project.rootDocumentId).toBe(INTRODUCTION_ID);
    const failure = await failureOf(
      update({ rootDocument: { documentId: INTRODUCTION_ID, path: "refs.bib" } }),
    );
    expect(failure).toBeInstanceOf(RequestNotSentError);
    expect(failure.message).toContain(".tex, .Rtex, .ltx and .Rnw");
  });

  it("switches spell checking to a language the editor offers, or off with an empty code", async () => {
    await update({ spellCheckLanguage: "de" });
    expect((await connection.joinProject()).details.spellCheckLanguage).toBe("de");
    await update({ spellCheckLanguage: "" });
    expect(connection.overleaf.projectSettings.spellCheckLanguage).toBe("");
    const failure = await failureOf(update({ spellCheckLanguage: "xx" }));
    expect(failure).toBeInstanceOf(RequestNotSentError);
    expect(failure.message).toContain("en, en_GB, de");
  });

  it("switches TeX Live to a version this account may use and refuses the others", async () => {
    await update({ texLiveImage: "texlive-full:2024.1" });
    expect((await connection.joinProject()).details.texLiveImage).toBe("texlive-full:2024.1");
    for (const image of ["texlive-full:2017.1", "texlive-full:1999.1"]) {
      const failure = await failureOf(update({ texLiveImage: image }));
      expect(failure).toBeInstanceOf(RequestNotSentError);
      expect(failure.message).toContain("texlive-full:2025.1 (TeX Live 2025)");
    }
  });

  it("passes on Overleaf's refusal for an account without edit access", async () => {
    connection.overleaf.permissionsLevel = "review";
    expect(statusOf(await failureOf(update({ compiler: "lualatex" })))).toBe(403);
  });

  it("refuses a change that names no setting", async () => {
    expect(await failureOf(update({}))).toBeInstanceOf(RequestNotSentError);
  });

  it("reads the choices the editor page offers", async () => {
    const choices = await fetchProjectSettingChoices(connection.client(), connection.overleaf.projectId);
    expect(choices.texLiveImages).toContainEqual({
      imageName: "texlive-full:2017.1",
      description: "TeX Live 2017 (legacy)",
      allowed: false,
    });
    expect(choices.spellCheckLanguages.map((language) => language.code)).toEqual(["en", "en_GB", "de"]);
    expect(choices.hasTrackChangesFeature).toBe(true);
    connection.overleaf.hasTrackChangesFeature = false;
    const withoutFeature = await fetchProjectSettingChoices(
      connection.client(),
      connection.overleaf.projectId,
    );
    expect(withoutFeature.hasTrackChangesFeature).toBe(false);
  });
});
