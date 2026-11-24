import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * check_references and the whole-document outline through the MCP protocol, on a project
 * a collaborator pushed: a root file, an included section, a bibliography and a figure.
 */

const MAIN = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}\\label{sec:intro}",
  "\\input{sections/method}",
  "See \\ref{sec:method} and \\ref{fig:missing}, after \\cite{smith2020}.",
  "\\includegraphics{figures/plot}",
  "\\includegraphics{figures/absent}",
  "\\bibliography{refs}",
  "\\end{document}",
].join("\n");
const METHOD = "\\section{Method}\\label{sec:method}\n\\subsection{Data}\nAs \\cite{Jones2019} found.\n";
const BIBLIOGRAPHY = "@article{smith2020,\n}\n@article{jones2019,\n}\n@book{unused2000,\n}\n";
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

describe("the LaTeX source checks", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient | undefined;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", MAIN, "Draft");
    await remote.collaboratorPushes("sections/method.tex", METHOD, "Method");
    await remote.collaboratorPushes("refs.bib", BIBLIOGRAPHY, "References");
    await remote.collaboratorPushes("figures/plot.png", PNG_BYTES, "Plot");
    await remote.collaboratorPushes("old/notes.tex", "\\ref{nowhere}\n", "Notes");
  });

  afterEach(async () => {
    await client?.stop();
    client = undefined;
    remote.cleanUp();
  });

  async function startClient(): Promise<McpStdioClient> {
    client = await McpStdioClient.start(remote.environment());
    return client;
  }

  it("reports each problem with its file and line, then what is worth a look", async () => {
    const answer = await (await startClient()).call("check_references", {});
    expect(answer).toContain("Checked main.tex and 1 file it includes with refs.bib: 3 problems:");
    expect(answer).toContain("fig:missing  \\ref at main.tex:5");
    expect(answer).toContain(
      "Jones2019  \\cite at sections/method.tex:3; jones2019 exists, which differs only in letter case",
    );
    expect(answer).toContain(
      "\\includegraphics{figures/absent}  at main.tex:7; looked for figures/absent.pdf",
    );
    expect(answer).not.toContain("figures/plot}");
    expect(answer).toContain("2 bibliography entries are never cited: jones2019, unused2000");
    expect(answer).toContain("1 other .tex file, not included from main.tex, was not checked: old/notes.tex");
  });

  it("refuses a main document that does not exist, naming the ones that do", async () => {
    const answer = await (await startClient()).call("check_references", { mainTexFile: "paper.tex" });
    expect(answer).toContain('No file at "paper.tex"');
    expect(answer).toContain("main.tex, old/notes.tex, sections/method.tex");
  });

  it("outlines the whole document across included files unless told not to", async () => {
    const mcp = await startClient();
    const single = await mcp.call("read_project", {
      view: "outline",
      path: "main.tex",
      followIncludes: false,
    });
    expect(single).toContain("\\section{Introduction}  [lines 3-");
    expect(single).not.toContain("Method");

    const expectedOutline = [
      "    \\section{Introduction}  [main.tex lines 3-7]",
      "    \\section{Method}  [sections/method.tex lines 1-4]",
      "      \\subsection{Data}  [sections/method.tex lines 2-4]",
    ];
    const byDefault = await mcp.call("read_project", { view: "outline", path: "main.tex" });
    expect(byDefault.split("\n")).toEqual(expectedOutline);
    const whole = await mcp.call("read_project", { view: "outline", path: "main.tex", followIncludes: true });
    expect(whole).toBe(byDefault);

    const withoutPath = await mcp.call("read_project", { view: "outline" });
    expect(withoutPath.split("\n")).toEqual([
      "Outline of main.tex, the likely main document:",
      ...expectedOutline,
    ]);
  });
});
