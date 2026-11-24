import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeMetadataServices } from "../fakeMetadataServices.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";

/**
 * look_up_citations with only a session cookie: both actions read the project from Overleaf's
 * editor instead of a clone, and look the entries up the same way.
 */

const CITING_PAPER = "\\begin{document}\n\\cite{real2017,fakedoi}\n\\bibliography{refs}\n\\end{document}\n";
const BIBLIOGRAPHY = [
  "@article{real2017, title = {Attention Is All You Need}, doi = {10.5555/real}}",
  "@article{fakedoi, title = {A Paper Nobody Wrote}, doi = {10.5555/missing}}",
].join("\n");

describe("look_up_citations over the editor, with only a session cookie", () => {
  const harness = useEditorTestHarness();
  let metadata: FakeMetadataServices;

  beforeEach(async () => {
    metadata = await FakeMetadataServices.start();
    metadata.dois.set("10.5555/real", { title: "Attention is all you need" });
    metadata.doiBibtex.set(
      "10.5555/real",
      "@article{Vaswani_2017, title={Attention Is All You Need}, DOI={10.5555/real}, author={Vaswani, Ashish}, year={2017}}",
    );
  });

  afterEach(async () => {
    await metadata.stop();
  });

  function startCookieOnlyClient() {
    harness.editor.addDocument("refs.bib", BIBLIOGRAPHY);
    harness.editor.addDocument("paper.tex", CITING_PAPER);
    return harness.startClient({
      OVERLEAF_SESSION_COOKIE: harness.editor.cookieHeader,
      OVERLEAF_WEB_BASE_URL: harness.editor.baseUrl,
      OVERLEAF_PROJECTS: `paper=${harness.gitRemote.projectId}`,
      OVERLEAF_MCP_WORKSPACE_DIR: harness.gitRemote.workspaceDirectory,
      XDG_CONFIG_HOME: harness.gitRemote.workspaceDirectory,
      ...metadata.environment(),
    });
  }

  it("verifies the entries a document cites, read from the editor", async () => {
    const client = await startCookieOnlyClient();
    const answer = await client.call("look_up_citations", { mainTexFile: "paper.tex" });
    expect(answer).toContain(
      "Looked up 2 entries from refs.bib: 1 entry points at a missing or different work.",
    );
    expect(answer).toContain(
      "fakedoi (refs.bib:2): DOI 10.5555/missing does not resolve; doi.org has no such DOI.",
    );
    expect(answer).toContain("Confirmed (1): real2017 (DOI)");
  });

  it("starts from the main document Overleaf has set when none is named", async () => {
    const client = await startCookieOnlyClient();
    expect(await client.call("look_up_citations", {})).toBe(
      "main.tex cites no entry in any bibliography file.",
    );
    expect(metadata.requests).toEqual([]);
  });

  it("finds a work by DOI and names the key the bibliography already holds it under", async () => {
    const client = await startCookieOnlyClient();
    const answer = await client.call("look_up_citations", { action: "find", queries: ["10.5555/real"] });
    expect(answer).toContain(
      "Looked up 1 query: 1 found, 0 with matches to choose from, 0 without an entry.",
    );
    expect(answer).toContain("Keys avoid those already in refs.bib.");
    expect(answer).toContain("@article{vaswani2017attention,");
    expect(answer).toContain("This work is already in the bibliography as real2017;");
  });
});
