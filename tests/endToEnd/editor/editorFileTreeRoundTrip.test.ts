import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LIVE_PROJECT_NAME, LiveOverleafServer, liveRunIdentifier } from "../support/liveOverleafServer.js";
import { liveEditorConfigured } from "../support/liveOverleafSettings.js";
import { callSucceeding, listedFilePaths } from "../support/liveToolCalls.js";

const runIdentifier = liveRunIdentifier();
const SCRATCH_ROOT_OF_EVERY_RUN = "mcp-e2e";
const scratchFolder = `${SCRATCH_ROOT_OF_EVERY_RUN}/${runIdentifier}`;
const notesPath = `${scratchFolder}/notes.tex`;
const renamedNotesPath = `${scratchFolder}/renamed.tex`;
const figurePath = `${scratchFolder}/figures/plot.png`;
const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
const IS_LIVE = "It is in Overleaf now; co-authors see it already.";

const notes = [
  "\\section{Method}",
  `Run ${runIdentifier} measured twice.`,
  "\\section{Results}",
  "Nothing yet.",
  "",
].join("\n");
const appendedLine = `% appended by run ${runIdentifier}`;

describe.skipIf(!liveEditorConfigured)(
  "the editor's file tree and whole-file edits against a live Overleaf project, cookie only",
  () => {
    let server: LiveOverleafServer;
    const call = (toolName: string, toolArguments: Record<string, unknown> = {}) =>
      callSucceeding(server.client, toolName, { project: LIVE_PROJECT_NAME, ...toolArguments });
    const listedPaths = async () => listedFilePaths(await call("read_project", { view: "files" }));

    beforeAll(async () => {
      server = await LiveOverleafServer.start("editorOnly");
    });

    // Deletes the whole scratch root, so a run that crashed before its own cleanup is cleaned
    // up by the next one.
    afterAll(async () => {
      if (!server) return;
      try {
        const leftovers = (await listedPaths()).filter((path) =>
          path.startsWith(`${SCRATCH_ROOT_OF_EVERY_RUN}/`),
        );
        if (leftovers.length > 0)
          await call("manage_files", { action: "delete", path: SCRATCH_ROOT_OF_EVERY_RUN });
        expect(await listedPaths()).not.toContain(renamedNotesPath);
      } finally {
        await server.stop();
      }
    });

    it("creates a folder with its missing parents at once", async () => {
      expect(
        await call("manage_files", { action: "create_folder", path: `${scratchFolder}/figures` }),
      ).toContain(`Created the folder ${scratchFolder}/figures in Overleaf`);
    });

    it("writes a new document and reads it back", async () => {
      await call("edit_file", { action: "write", path: notesPath, content: notes });
      const written = await call("read_file", { path: notesPath });
      expect(written).toContain(`Run ${runIdentifier} measured twice.`);
      expect(written).toContain("\\section{Results}\nNothing yet.");
      expect(await listedPaths()).toContain(notesPath);
    });

    it("appends a line and replaces a section in place", async () => {
      expect(await call("edit_file", { action: "append", path: notesPath, content: appendedLine })).toBe(
        `Appended 1 line to the end of ${notesPath}. ${IS_LIVE}`,
      );
      await call("edit_file", {
        action: "replace_section",
        path: notesPath,
        sectionTitle: "Results",
        content: "\\section{Results}\nThe effect held.\n",
      });
      const edited = await call("read_file", { path: notesPath });
      expect(edited).toContain("The effect held.");
      expect(edited).not.toContain("Nothing yet.");
      expect(edited).toContain(`Run ${runIdentifier} measured twice.`);
    });

    it("outlines and searches the new document", async () => {
      const outline = await call("read_project", { view: "outline", path: notesPath });
      expect(outline).toContain("Method");
      expect(outline).toContain("Results");
      expect(await call("search_project", { query: runIdentifier })).toContain(notesPath);
    });

    it("uploads a binary file into the folder", async () => {
      expect(
        await call("manage_files", { action: "upload", path: figurePath, contentBase64: PNG_BASE64 }),
      ).toBe(`Added ${figurePath} (8 bytes) in Overleaf, stored as a binary file. ${IS_LIVE}`);
      expect(await listedPaths()).toContain(figurePath);
    });

    it("renames a document and keeps its text", async () => {
      await call("manage_files", { action: "move", path: notesPath, toPath: renamedNotesPath });
      const paths = await listedPaths();
      expect(paths).toContain(renamedNotesPath);
      expect(paths).not.toContain(notesPath);
      expect(await call("read_file", { path: renamedNotesPath })).toContain("The effect held.");
    });

    it("deletes the run's folder with everything in it", async () => {
      await call("manage_files", { action: "delete", path: scratchFolder });
      expect((await listedPaths()).filter((path) => path.startsWith(`${scratchFolder}/`))).toEqual([]);
    });
  },
);
