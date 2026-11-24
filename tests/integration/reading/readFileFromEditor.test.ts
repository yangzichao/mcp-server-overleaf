import { describe, expect, it } from "vitest";

import { MAXIMUM_IMAGE_BYTES } from "../../../src/images/prepareImageForModel.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";
import { paddedPng, SMALL_PNG } from "../support/testImages.js";

/**
 * read_file with only a session cookie: uploaded figures come back as images downloaded from
 * Overleaf, other uploads as a refusal naming what to do, and followIncludes inlines the
 * editor's documents.
 */

describe("read_file over the editor, with only a session cookie", () => {
  const harness = useEditorTestHarness();

  function startCookieOnlyClient() {
    return harness.startClient({
      OVERLEAF_SESSION_COOKIE: harness.editor.cookieHeader,
      OVERLEAF_WEB_BASE_URL: harness.editor.baseUrl,
      OVERLEAF_PROJECTS: `paper=${harness.gitRemote.projectId}`,
      OVERLEAF_MCP_WORKSPACE_DIR: harness.gitRemote.workspaceDirectory,
      XDG_CONFIG_HOME: harness.gitRemote.workspaceDirectory,
    });
  }

  function addUpload(fileId: string, path: string, bytes: Buffer): void {
    harness.editor.tree.files.set(fileId, { fileId, path, bytes });
  }

  async function refusalFor(toolArguments: Record<string, unknown>): Promise<string> {
    const client = await startCookieOnlyClient();
    const response = await client.callRaw("read_file", toolArguments);
    expect(response.result?.isError, JSON.stringify(toolArguments)).toBe(true);
    return response.result?.content?.[0]?.text ?? "";
  }

  it("downloads an uploaded PNG and returns it as an image block", async () => {
    addUpload("64f000000000000000000e51", "plot.png", SMALL_PNG);
    const client = await startCookieOnlyClient();
    const response = await client.callRaw("read_file", { path: "plot.png" });
    expect(response.result?.isError).toBeFalsy();
    expect(response.result?.content).toEqual([
      { type: "text", text: `plot.png: PNG image, 3 by 2 pixels, ${SMALL_PNG.length} bytes.` },
      { type: "image", data: SMALL_PNG.toString("base64"), mimeType: "image/png" },
    ]);
  });

  it("refuses an upload too large to send, without downloading past the limit", async () => {
    addUpload("64f000000000000000000e52", "huge.png", paddedPng(MAXIMUM_IMAGE_BYTES + 1));
    expect(await refusalFor({ path: "huge.png" })).toBe(
      `huge.png is larger than the ${MAXIMUM_IMAGE_BYTES} bytes an image sent to the model may have. Upload a smaller or more compressed copy (for example a JPEG, or a PNG scaled down) and read that.`,
    );
  });

  it("refuses a damaged figure, saying it looks cut short", async () => {
    expect(await refusalFor({ path: "figure.png" })).toContain(
      "figure.png starts like a PNG image, but its size could not be read; the file looks damaged or cut short.",
    );
  });

  it("refuses a PDF upload with the command that renders it, and points at download_zip", async () => {
    addUpload("64f000000000000000000e53", "diagram.pdf", Buffer.from("%PDF-1.5\n\0"));
    const refusal = await refusalFor({ path: "diagram.pdf" });
    expect(refusal).toContain("diagram.pdf is a PDF, which is not sent as an image.");
    expect(refusal).toContain("pdftoppm -png");
    expect(refusal).toContain("manage_project (action download_zip) saves the whole project");
  });

  it("refuses the arguments that shape a text read on an image", async () => {
    expect(await refusalFor({ path: "figure.png", startLine: 1 })).toBe(
      "figure.png is an image, which read_file returns whole as it is now; startLine applies to text files only.",
    );
    expect(await refusalFor({ path: "figure.png", sectionTitle: "Intro" })).toBe(
      "figure.png is an image, which read_file returns whole as it is now; sectionTitle applies to text files only.",
    );
  });

  it("inlines the documents a file includes, as the editor holds them", async () => {
    harness.editor.addDocument("sections/intro.tex", "Intro text.\n");
    harness.editor.addDocument(
      "thesis.tex",
      "\\begin{document}\n\\input{sections/intro}\n\\input{sections/gone}\n\\end{document}\n",
    );
    const client = await startCookieOnlyClient();
    const text = await client.call("read_file", { path: "thesis.tex", followIncludes: true });
    expect(text).toContain(
      "% ---- begin sections/intro.tex, from \\input{sections/intro} ----\nIntro text.\n% ---- end sections/intro.tex ----",
    );
    expect(text).toContain(
      'Inlined 1 file between "% ---- begin" and "% ---- end" comments: sections/intro.tex.',
    );
    expect(text).toContain("Not found, left as written: \\input{sections/gone} at thesis.tex:3;");
    expect(await refusalFor({ path: "thesis.tex", followIncludes: true, endLine: 2 })).toBe(
      "followIncludes returns the whole file with its includes inlined, so it cannot use endLine.",
    );
  });
});
