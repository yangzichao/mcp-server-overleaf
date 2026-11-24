Feature: Broken references are found without compiling

  check_references reads the source the way LaTeX would and lists every broken reference,
  citation and included file with the file and line to fix. A ?? in the PDF is caught
  before anyone compiles.

  Background:
    Given the co-author has published a paper with a method section, a bibliography and a figure

  Scenario: Each problem is reported with the file and line to fix
    When I check the references
    Then the check says "Checked main.tex and 1 file it includes with refs.bib: 3 problems:"
    And the check lists these problems:
      | problem                                                                                      |
      | fig:missing  \ref at main.tex:5                                                              |
      | Jones2019  \cite at sections/method.tex:3; jones2019 exists, which differs only in letter case |
      | \includegraphics{figures/absent}  at main.tex:7; looked for figures/absent.pdf               |
    But the check does not report "figures/plot", which exists

  Scenario: What is worth a look but not wrong is noted separately
    When I check the references
    Then the check notes "2 bibliography entries are never cited: jones2019, unused2000"
    And the check notes "1 other .tex file, not included from main.tex, was not checked: old/notes.tex"

  Scenario: The check reads local edits, so a fix shows up before it is pushed
    When I point the broken figure reference at the introduction instead
    And I check the references
    Then the check says "Checked main.tex and 1 file it includes with refs.bib: 2 problems:"
    And the check does not report "fig:missing"

  Scenario: A main document that does not exist is refused, naming the ones that do
    When I check the references starting from "paper.tex"
    Then the check says there is no file at "paper.tex"
    And the check names the .tex files that exist: "main.tex, old/notes.tex, sections/method.tex"
