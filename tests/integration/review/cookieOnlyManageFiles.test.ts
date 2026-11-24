import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { callExpectingError, startCookieOnlyClient } from "../support/cookieOnlyClient.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";

const IS_LIVE = "It is in Overleaf now; co-authors see it already.";
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xde, 0xad, 0xbe, 0xef]);

describe("manage_files over the web file tree, with only a session cookie", () => {
  const harness = useEditorTestHarness();
  let sourceDirectory: string;

  beforeEach(() => {
    sourceDirectory = mkdtempSync(join(tmpdir(), "overleaf-editor-upload-"));
  });

  afterEach(() => {
    rmSync(sourceDirectory, { recursive: true, force: true });
  });

  it("deletes a document, an upload, an empty folder and a folder with files", async () => {
    const introId = harness.editor.addDocument("sections/intro.tex", "\\section{Intro}\n");
    harness.editor.addDocument("sections/method.tex", "\\section{Method}\n");
    const notesId = harness.editor.addDocument("notes.tex", "Notes.\n");
    harness.editor.tree.ensureFolder("empty");
    const client = await startCookieOnlyClient(harness);

    expect(await client.call("manage_files", { action: "delete", path: "notes.tex" })).toBe(
      `Deleted notes.tex from Overleaf. ${IS_LIVE}`,
    );
    expect(harness.editor.tree.entityAt("notes.tex")).toBeUndefined();
    expect(() => harness.editor.documentText(notesId)).toThrow();

    expect(await client.call("manage_files", { action: "delete", path: "figure.png" })).toBe(
      `Deleted figure.png from Overleaf. ${IS_LIVE}`,
    );
    expect(harness.editor.tree.files.size).toBe(0);

    expect(await client.call("manage_files", { action: "delete", path: "empty" })).toBe(
      `Deleted the empty folder empty from Overleaf. ${IS_LIVE}`,
    );

    expect(await client.call("manage_files", { action: "delete", path: "sections/" })).toBe(
      `Deleted the folder sections and the 2 files in it (sections/intro.tex, sections/method.tex) from Overleaf. ${IS_LIVE}`,
    );
    expect(harness.editor.tree.entityAt("sections")).toBeUndefined();
    expect(() => harness.editor.documentText(introId)).toThrow();
    expect(harness.editor.documentText(harness.mainDocumentId)).toContain("Hello world.");
  });

  it("says when there is nothing to delete, and when the main document went", async () => {
    harness.editor.addDocument("other.tex", "Other.\n");
    const client = await startCookieOnlyClient(harness);
    expect(await client.call("manage_files", { action: "delete", path: "absent.tex" })).toBe(
      "absent.tex is not in the project, so there is nothing to delete.",
    );
    expect(await client.call("manage_files", { action: "delete", path: "main.tex" })).toBe(
      `Deleted main.tex from Overleaf. ${IS_LIVE} It held the project's main document, so choose another before compiling, in Overleaf's menu or with manage_project (action update_settings).`,
    );
  });

  it("moves and renames a document in one call, keeping the document itself", async () => {
    const introId = harness.editor.addDocument("sections/intro.tex", "\\section{Intro}\n");
    const client = await startCookieOnlyClient(harness);
    expect(
      await client.call("manage_files", {
        action: "move",
        path: "sections/intro.tex",
        toPath: "chapters/introduction.tex",
      }),
    ).toBe(
      `Moved sections/intro.tex to chapters/introduction.tex in Overleaf. ${IS_LIVE} ` +
        "Any \\input, \\include or \\includegraphics still naming sections/intro.tex now points at nothing; search_project for it and fix it with edit_file.",
    );
    expect(harness.editor.documentPath(introId)).toBe("chapters/introduction.tex");
    expect(harness.editor.tree.entityAt("chapters")?.type).toBe("folder");

    await client.call("manage_files", { action: "move", path: "main.tex", toPath: "paper.tex" });
    expect(harness.editor.documentPath(harness.mainDocumentId)).toBe("paper.tex");
  });

  it("moves a folder with everything in it", async () => {
    const introId = harness.editor.addDocument("sections/intro.tex", "\\section{Intro}\n");
    const client = await startCookieOnlyClient(harness);
    expect(
      await client.call("manage_files", { action: "move", path: "sections", toPath: "parts/sections" }),
    ).toBe(
      `Moved the folder sections, with the 1 file in it (sections/intro.tex), to parts/sections in Overleaf. ${IS_LIVE} ` +
        "Any \\input, \\include or \\includegraphics still naming a path under sections/ now points at nothing; search_project for it and fix it with edit_file.",
    );
    expect(harness.editor.documentPath(introId)).toBe("parts/sections/intro.tex");
  });

  it("refuses a taken destination, a folder moved into itself, and a move to the same path", async () => {
    const client = await startCookieOnlyClient(harness);
    expect(
      await callExpectingError(client, "manage_files", {
        action: "move",
        path: "main.tex",
        toPath: "figure.png",
      }),
    ).toBe("figure.png already exists. Nothing was moved. Delete it first, or choose another destination.");
    expect(
      await callExpectingError(client, "manage_files", {
        action: "move",
        path: "sections",
        toPath: "sections/inner",
      }),
    ).toBe("sections/inner is inside sections, and a folder cannot be moved into itself. Nothing was moved.");
    expect(
      await client.call("manage_files", { action: "move", path: "main.tex", toPath: "./main.tex" }),
    ).toBe("path and toPath are the same (main.tex). Nothing was moved.");
    expect(
      await callExpectingError(client, "manage_files", {
        action: "move",
        path: "absent.tex",
        toPath: "x.tex",
      }),
    ).toBe("absent.tex is not in the project, so there is nothing to move.");
    expect(harness.editor.documentPath(harness.mainDocumentId)).toBe("main.tex");
  });

  it("renames before moving when the old name is taken in the target folder", async () => {
    const movedId = harness.editor.addDocument("a/x.tex", "Moved.\n");
    const stayingId = harness.editor.addDocument("b/x.tex", "Staying.\n");
    const client = await startCookieOnlyClient(harness);
    await client.call("manage_files", { action: "move", path: "a/x.tex", toPath: "b/y.tex" });
    expect(harness.editor.documentPath(movedId)).toBe("b/y.tex");
    expect(harness.editor.documentPath(stayingId)).toBe("b/x.tex");
  });

  it("refuses a move that collides whichever step goes first", async () => {
    const movedId = harness.editor.addDocument("a/x.tex", "Moved.\n");
    harness.editor.addDocument("b/x.tex", "Taken.\n");
    harness.editor.addDocument("a/y.tex", "Taken too.\n");
    const client = await startCookieOnlyClient(harness);
    expect(
      await callExpectingError(client, "manage_files", {
        action: "move",
        path: "a/x.tex",
        toPath: "b/y.tex",
      }),
    ).toBe(
      "Overleaf moves and renames in two steps, and both orders collide with a name already taken: b/x.tex and a/y.tex. Nothing was moved; rename or move one of those first.",
    );
    expect(harness.editor.documentPath(movedId)).toBe("a/x.tex");
  });

  it("uploads text as a document and anything else as a binary file, creating folders", async () => {
    const source = join(sourceDirectory, "plot.png");
    writeFileSync(source, PNG_BYTES);
    const client = await startCookieOnlyClient(harness);

    expect(
      await client.call("manage_files", {
        action: "upload",
        path: "notes/readme.txt",
        contentBase64: Buffer.from("Hello\n").toString("base64"),
      }),
    ).toBe(`Added notes/readme.txt (6 bytes) in Overleaf, stored as an editable document. ${IS_LIVE}`);
    const readme = harness.editor.tree.entityAt("notes/readme.txt");
    expect(readme?.type).toBe("doc");
    expect(harness.editor.documentText(readme?.id ?? "")).toBe("Hello\n");

    expect(
      await client.call("manage_files", { action: "upload", path: "figures/plot.png", sourcePath: source }),
    ).toBe(`Added figures/plot.png (13 bytes) in Overleaf, stored as a binary file. ${IS_LIVE}`);
    const plot = harness.editor.tree.entityAt("figures/plot.png");
    expect(plot?.type).toBe("file");
    expect(harness.editor.tree.files.get(plot?.id ?? "")?.bytes).toEqual(PNG_BYTES);

    expect(
      await client.call("manage_files", {
        action: "upload",
        path: "figure.png",
        contentBase64: PNG_BYTES.toString("base64"),
      }),
    ).toBe(`Replaced figure.png (13 bytes) in Overleaf, stored as a binary file. ${IS_LIVE}`);
    const figure = harness.editor.tree.entityAt("figure.png");
    expect(harness.editor.tree.files.get(figure?.id ?? "")?.bytes).toEqual(PNG_BYTES);
  });

  it("refuses an upload onto a folder, under a document, or with two sources", async () => {
    const source = join(sourceDirectory, "plot.png");
    writeFileSync(source, PNG_BYTES);
    const client = await startCookieOnlyClient(harness);
    const contentBase64 = PNG_BYTES.toString("base64");
    expect(
      await callExpectingError(client, "manage_files", { action: "upload", path: "sections", contentBase64 }),
    ).toBe("sections is a folder in Overleaf, so a file cannot be uploaded there. Nothing was changed.");
    expect(
      await callExpectingError(client, "manage_files", {
        action: "upload",
        path: "main.tex/plot.png",
        contentBase64,
      }),
    ).toBe(
      "main.tex is an editable document in Overleaf, not a folder, so nothing can go inside it. Nothing was changed.",
    );
    expect(
      await callExpectingError(client, "manage_files", {
        action: "upload",
        path: "plot.png",
        sourcePath: source,
        contentBase64,
      }),
    ).toBe("Give exactly one of sourcePath and contentBase64.");
    expect(harness.editor.tree.entityAt("plot.png")).toBeUndefined();
  });

  it("creates a folder with its missing parents, and leaves an existing one alone", async () => {
    const client = await startCookieOnlyClient(harness);
    expect(await client.call("manage_files", { action: "create_folder", path: "figures/plots" })).toBe(
      `Created the folder figures/plots in Overleaf, with its missing parent folder figures. ${IS_LIVE} ` +
        "Put files in it with edit_file (action write) or manage_files (action upload), naming paths under it.",
    );
    expect(harness.editor.tree.entityAt("figures/plots")?.type).toBe("folder");
    expect(await client.call("manage_files", { action: "create_folder", path: "sections" })).toBe(
      "sections is already a folder in Overleaf, so nothing was created.",
    );
    expect(
      await callExpectingError(client, "manage_files", { action: "create_folder", path: "figure.png" }),
    ).toBe(
      "figure.png is an uploaded binary file in Overleaf, so a folder cannot be created there. Nothing was changed.",
    );
  });

  it("refuses every change without edit access, before anything is sent", async () => {
    harness.editor.permissionsLevel = "review";
    const client = await startCookieOnlyClient(harness);
    for (const call of [
      { action: "delete", path: "figure.png" },
      { action: "move", path: "figure.png", toPath: "plot.png" },
      { action: "upload", path: "plot.png", contentBase64: PNG_BYTES.toString("base64") },
      { action: "create_folder", path: "figures" },
    ]) {
      expect(await callExpectingError(client, "manage_files", call)).toBe(
        'This account\'s access to the project is "can review", and Overleaf needs edit access to change its files and folders. Nothing was changed.',
      );
    }
    expect(harness.editor.tree.entityAt("figure.png")?.type).toBe("file");
    expect(harness.editor.tree.entityAt("figures")).toBeUndefined();
  });

  it("checks the arguments against the action", async () => {
    const client = await startCookieOnlyClient(harness);
    expect(await callExpectingError(client, "manage_files", { action: "move", path: "main.tex" })).toBe(
      "move needs toPath.",
    );
    expect(
      await callExpectingError(client, "manage_files", {
        action: "delete",
        path: "main.tex",
        toPath: "x.tex",
      }),
    ).toBe("toPath does not apply to delete; move uses it.");
    expect(
      await callExpectingError(client, "manage_files", {
        action: "move",
        path: "main.tex",
        toPath: "x.tex",
        sourcePath: "/tmp/x.png",
      }),
    ).toBe("sourcePath does not apply to move; upload and upload_folder use it.");
    expect(await callExpectingError(client, "manage_files", { action: "create_folder", path: "  " })).toBe(
      "path must name a file or folder inside the project, for example figures/plot.png; the project's root folder cannot be changed.",
    );
    expect(harness.editor.documentPath(harness.mainDocumentId)).toBe("main.tex");
  });
});
