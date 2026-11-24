import { describe, expect, it } from "vitest";

import { startCookieOnlyClient } from "../support/cookieOnlyClient.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";

describe("search_project and check_references over the editor, with only a session cookie", () => {
  const harness = useEditorTestHarness();

  it("searches every editable document as the editor holds it", async () => {
    harness.editor.addDocument("sections/intro.tex", "\\section{Intro}\nHello again.\n");
    const client = await startCookieOnlyClient(harness);
    expect(await client.call("search_project", { query: "hello" })).toBe(
      "main.tex:3: Hello world.\nsections/intro.tex:2: Hello again.",
    );
    expect(await client.call("search_project", { query: "^\\\\section", isRegularExpression: true })).toBe(
      "sections/intro.tex:1: \\section{Intro}",
    );
    expect(await client.call("search_project", { query: "absent" })).toBe('No matches for "absent".');
  });

  it("checks references from the main document set in Overleaf, or from mainTexFile", async () => {
    const paperId = harness.editor.addDocument(
      "paper.tex",
      "\\documentclass{article}\n\\begin{document}\n\\input{sections/body}\n\\end{document}\n",
    );
    harness.editor.addDocument("sections/body.tex", "See Section~\\ref{sec:missing}.\n");
    harness.editor.rootDocumentId = paperId;
    const client = await startCookieOnlyClient(harness);

    const report = await client.call("check_references", {});
    expect(report).toContain("Checked paper.tex and 1 file it includes with no bibliography: 1 problem:");
    expect(report).toContain("sec:missing");

    const fromMainTex = await client.call("check_references", { mainTexFile: "main.tex" });
    expect(fromMainTex).toMatch(/^Checked main\.tex with no bibliography: no problems found\.\n/);
    expect(fromMainTex).toContain(
      "not included from main.tex, were not checked: paper.tex, sections/body.tex",
    );
  });
});
