import { describe, expect, it } from "vitest";

import { checkProjectReferences } from "../../../src/latex/references/checkProjectReferences.js";
import { countReferenceProblems } from "../../../src/latex/references/referenceCheckReport.js";
import { inMemoryProject } from "../support/inMemoryProject.js";

const CLEAN_MAIN = [
  "\\documentclass{article}",
  "\\usepackage{graphicx,cleveref}",
  "\\graphicspath{{figures/}}",
  "\\begin{document}",
  "\\input{sections/intro}",
  "See \\cref{fig:plot,sec:intro} and \\pageref{LastPage}.",
  "\\begin{figure}\\includegraphics[width=\\linewidth]{plot}\\caption{A plot}\\label{fig:plot}\\end{figure}",
  "\\bibliography{refs}",
  "\\end{document}",
].join("\n");
const CLEAN_INTRO =
  "\\section{Introduction}\\label{sec:intro}\nAs shown by \\citet{smith2020} and \\citep[p.~2]{lee2021}.\n";
const CLEAN_BIBLIOGRAPHY = "@article{smith2020,\n  title={A}\n}\n\n@book{lee2021,\n  title={B}\n}\n";

describe("checkProjectReferences", () => {
  it("finds nothing wrong in a consistent document spread over several files", async () => {
    const project = inMemoryProject(
      { "main.tex": CLEAN_MAIN, "sections/intro.tex": CLEAN_INTRO, "refs.bib": CLEAN_BIBLIOGRAPHY },
      ["figures/plot.pdf"],
    );
    const report = await checkProjectReferences(project, "main.tex");
    expect(countReferenceProblems(report)).toBe(0);
    expect(report.checkedFiles).toEqual(["main.tex", "sections/intro.tex"]);
    expect(report.bibliographyFiles).toEqual(["refs.bib"]);
    expect(report.unusedLabels).toEqual([]);
    expect(report.unusedBibliographyEntries).toEqual([]);
  });

  it("reports an undefined reference and an undefined citation where they are used", async () => {
    const project = inMemoryProject({
      "main.tex":
        "\\begin{document}\n\\label{a}\nSee \\eqref{b} and \\cite{Smith2020}.\n\\bibliography{refs}\n",
      "refs.bib": "@article{smith2020,\n}\n",
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.undefinedReferences).toEqual([
      {
        key: "b",
        command: "eqref",
        locations: [{ path: "main.tex", line: 3 }],
        differsOnlyInCaseFrom: undefined,
      },
    ]);
    expect(report.undefinedCitations[0]).toMatchObject({
      key: "Smith2020",
      differsOnlyInCaseFrom: "smith2020",
    });
  });

  it("reads every key of a cleveref list, a range and a biblatex multicite", async () => {
    const project = inMemoryProject({
      "main.tex":
        "\\label{a}\\label{b}\\label{c}\n\\cref{a, b}\\crefrange{b}{missing}\n\\cites[see][]{x}[p.~3]{y}\n\\addbibresource{refs.bib}\n",
      "refs.bib": "@misc{x,}\n@misc{y,}\n",
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.undefinedReferences.map((reference) => reference.key)).toEqual(["missing"]);
    expect(report.unusedLabels).toEqual(["c"]);
    expect(report.undefinedCitations).toEqual([]);
    expect(report.unusedBibliographyEntries).toEqual([]);
  });

  it("reports a label defined in two files, and bibliography keys that differ only in case", async () => {
    const project = inMemoryProject({
      "main.tex": "\\label{sec:intro}\n\\include{intro}\n\\bibliography{refs}\n",
      "intro.tex": "\n\n\\label{sec:intro}\n",
      "refs.bib":
        "@article{Smith2020,\n}\n% @article{commented,}\n@string{journal = {J}}\n@article{smith2020,\n}\n",
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.duplicateLabels).toEqual([
      {
        key: "sec:intro",
        locations: [
          { path: "main.tex", line: 1 },
          { path: "intro.tex", line: 3 },
        ],
      },
    ]);
    expect(report.duplicateBibliographyKeys).toEqual([
      {
        key: "Smith2020",
        locations: [
          { path: "refs.bib", line: 1 },
          { path: "refs.bib", line: 5 },
        ],
      },
    ]);
  });

  it("names missing includes and figures with the paths it tried, honouring \\graphicspath", async () => {
    const project = inMemoryProject(
      {
        "main.tex":
          "\\graphicspath{{figures/}{img/}}\n\\input{sections/missing}\n\\includegraphics{found}\n\\includegraphics{lost.png}\n",
      },
      ["img/found.jpg"],
    );
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.missingFiles.map((missing) => missing.written)).toEqual([
      "\\input{sections/missing}",
      "\\includegraphics{lost.png}",
    ]);
    expect(report.missingFiles[0]?.tried).toEqual(["sections/missing.tex", "sections/missing"]);
    expect(report.missingFiles[1]?.tried).toEqual(["lost.png", "figures/lost.png", "img/lost.png"]);
  });

  it("skips the citation check when a named bibliography file is missing", async () => {
    const project = inMemoryProject({ "main.tex": "\\cite{a}\n\\bibliography{refs,more}\n", "refs.bib": "" });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.missingFiles.map((missing) => missing.tried)).toEqual([["more.bib"]]);
    expect(report.citationsNotCheckedBecause).toContain("\\bibliography{refs,more}");
    expect(report.undefinedCitations).toEqual([]);
  });

  it("checks citations against a hand-written thebibliography", async () => {
    const project = inMemoryProject({
      "main.tex":
        "\\cite{knuth84,lamport94}\n\\begin{thebibliography}{9}\n\\bibitem[Knuth]{knuth84} Knuth.\n\\end{thebibliography}\n",
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.hasThebibliography).toBe(true);
    expect(report.undefinedCitations.map((citation) => citation.key)).toEqual(["lamport94"]);
  });

  it("treats \\nocite{*} as citing every entry", async () => {
    const project = inMemoryProject({
      "main.tex": "\\nocite{*}\n\\bibliography{refs}\n",
      "refs.bib": "@misc{a,}\n@misc{b,}\n",
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.citesEveryEntry).toBe(true);
    expect(report.unusedBibliographyEntries).toEqual([]);
  });

  it("ignores comments, verbatim text and TikZ node labels, but reads a listing's label", async () => {
    const project = inMemoryProject({
      "main.tex": [
        "% \\ref{commented}",
        "\\begin{verbatim}",
        "\\ref{verbatim}",
        "\\end{verbatim}",
        "\\node[label=above:Top] {x};",
        "\\begin{lstlisting}[language=Python, label=lst:code]",
        "print(1)",
        "\\end{lstlisting}",
        "\\ref{lst:code}",
      ].join("\n"),
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(countReferenceProblems(report)).toBe(0);
    expect(report.unusedLabels).toEqual([]);
  });

  it("follows \\import into its directory, survives an include cycle, and lists files it never reached", async () => {
    const project = inMemoryProject({
      "main.tex": "\\import{chapters/}{one}\n\\input{main}\n",
      "chapters/one.tex": "\\input{two}\n\\label{one}\\ref{two}",
      "chapters/two.tex": "\\label{two}\\ref{one}\\input{../main}",
      "old/draft.tex": "\\ref{nowhere}",
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.checkedFiles).toEqual(["main.tex", "chapters/one.tex", "chapters/two.tex"]);
    expect(countReferenceProblems(report)).toBe(0);
    expect(report.texFilesNotIncluded).toEqual(["old/draft.tex"]);
    expect(project.reads.filter((path) => path === "main.tex")).toHaveLength(1);
  });

  it("counts paths and keys built from macros instead of guessing them", async () => {
    const project = inMemoryProject({
      "main.tex":
        "\\newcommand{\\fig}[1]{\\includegraphics{#1}\\label{#1}}\n\\input{\\chapterdir/intro}\n\\ref{\\currentlabel}\n",
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.pathsBuiltFromMacros).toBe(2);
    expect(countReferenceProblems(report)).toBe(0);
  });
});
