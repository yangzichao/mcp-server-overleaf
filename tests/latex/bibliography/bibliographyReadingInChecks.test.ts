import { describe, expect, it } from "vitest";

import { collectCitedRecords } from "../../../src/citations/collectCitedRecords.js";
import { checkProjectReferences } from "../../../src/latex/references/checkProjectReferences.js";
import { readProjectBibliography } from "../../../src/tools/latex/citations/findCitationEntries.js";
import { inMemoryProject } from "../support/inMemoryProject.js";

const BIBLIOGRAPHY_WITH_A_COMMENTED_OUT_ENTRY =
  "@misc{kept, title = {Kept}}\n% @misc{commented, title = {Commented}}\n";

describe("the .bib reading each check uses", () => {
  it("check_references reads the .bib files of a BibTeX document as BibTeX does", async () => {
    const project = inMemoryProject({
      "main.tex": "\\cite{kept,commented}\n\\bibliography{refs}\n",
      "refs.bib": BIBLIOGRAPHY_WITH_A_COMMENTED_OUT_ENTRY,
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.undefinedCitations).toEqual([]);
  });

  it("check_references reads the .bib files of a biblatex document as biber does", async () => {
    const project = inMemoryProject({
      "main.tex": "\\usepackage{biblatex}\n\\addbibresource{refs.bib}\n\\cite{kept,commented}\n",
      "refs.bib": BIBLIOGRAPHY_WITH_A_COMMENTED_OUT_ENTRY,
    });
    const report = await checkProjectReferences(project, "main.tex");
    expect(report.undefinedCitations.map((citation) => citation.key)).toEqual(["commented"]);
  });

  it("verify expands a macro an earlier .bib file defines, in the order the document names them", async () => {
    const project = inMemoryProject({
      "main.tex": "\\cite{smith2020}\n\\bibliography{strings,refs}\n",
      "strings.bib": '@string{icml = "International Conference on Machine Learning"}\n',
      "refs.bib": "@inproceedings{smith2020, title = {T}, booktitle = icml}\n",
    });
    const bibliography = await collectCitedRecords(project, "main.tex");
    expect(bibliography.records.map((record) => record.fields.get("booktitle"))).toEqual([
      "International Conference on Machine Learning",
    ]);
  });

  it("verify keeps a cited entry an error cut short, with the fields read before the error", async () => {
    const project = inMemoryProject({
      "main.tex": "\\cite{smith2020}\n\\bibliography{refs}\n",
      "refs.bib": "@article{smith2020,\n  title = {Deep Learning}\n  year = 2015\n}\n",
    });
    const bibliography = await collectCitedRecords(project, "main.tex");
    expect(bibliography.keysWithoutEntries).toEqual([]);
    expect(bibliography.records.map((record) => Object.fromEntries(record.fields))).toEqual([
      { title: "Deep Learning" },
    ]);
  });

  it("find takes every key either program could read as taken", async () => {
    const project = inMemoryProject({ "refs.bib": "% @misc{commented}\n@misc{first} @misc{second}" });
    const bibliography = await readProjectBibliography(project);
    expect(bibliography.entries.map((entry) => entry.key)).toEqual(["commented", "first", "second"]);
  });
});
