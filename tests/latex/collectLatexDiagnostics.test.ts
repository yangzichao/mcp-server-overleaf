import { describe, expect, it } from "vitest";

import { collectLatexDiagnostics } from "../../src/latex/collectLatexDiagnostics.js";

describe("collectLatexDiagnostics", () => {
  it("picks LaTeX errors and the warnings a reader acts on", () => {
    const diagnostics = collectLatexDiagnostics(
      [
        "(./main.tex",
        "./main.tex:3: Undefined control sequence.",
        "! Emergency stop.",
        "LaTeX Warning: Citation `smith2020' on page 1 undefined on input line 9.",
        "Overfull \\hbox (2.0pt too wide) in paragraph at lines 4--5",
        "Output written on main.pdf (1 page).",
      ].join("\n"),
    );
    expect(diagnostics.errorLines).toEqual([
      "./main.tex:3: Undefined control sequence.",
      "! Emergency stop.",
    ]);
    expect(diagnostics.warningLines).toHaveLength(2);
  });

  it("recognises BibTeX's errors and warnings", () => {
    const diagnostics = collectLatexDiagnostics(
      [
        "I couldn't open database file refs.bib",
        "I found no \\citation commands---while reading file main.aux",
        "Repeated entry---line 9 of file refs.bib",
        'Warning--I didn\'t find a database entry for "lee2021"',
        "(There were 3 error messages)",
      ].join("\n"),
    );
    expect(diagnostics.errorLines).toEqual([
      "I couldn't open database file refs.bib",
      "I found no \\citation commands---while reading file main.aux",
      "Repeated entry---line 9 of file refs.bib",
    ]);
    expect(diagnostics.warningLines).toEqual(['Warning--I didn\'t find a database entry for "lee2021"']);
  });

  it("recognises biber's messages on the console and in its log", () => {
    const diagnostics = collectLatexDiagnostics(
      [
        "INFO - This is Biber 2.19",
        "WARN - Duplicate entry key 'smith2020' in file 'refs.bib', skipping ...",
        "[211] Utils.pm:411> ERROR - Cannot find 'refs.bib'!",
      ].join("\n"),
    );
    expect(diagnostics.errorLines).toEqual(["[211] Utils.pm:411> ERROR - Cannot find 'refs.bib'!"]);
    expect(diagnostics.warningLines).toEqual([
      "WARN - Duplicate entry key 'smith2020' in file 'refs.bib', skipping ...",
    ]);
  });
});
