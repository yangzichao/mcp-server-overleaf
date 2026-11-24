Feature: Compiling on Overleaf's servers needs no TeX installation here

  compile_project (where overleaf) does what the Recompile button does and reads the log back,
  so errors and warnings are reported the way a local compile reports them. It saves the PDF and
  the log in this server's build directory, replacing the previous compile's, and it never
  overwrites a file there that is not a PDF.

  Background:
    Given I am signed in to Overleaf

  Scenario: A clean build is reported as compiled, with its output files
    When I compile the project on Overleaf
    Then the reply says "Compiled on Overleaf."
    And the reply says "Output files: output.pdf, output.log"

  Scenario: Errors in the log are reported even when a PDF was still produced
    Given the paper has an undefined control sequence on line 3 and a reference to a missing figure
    When I compile the project on Overleaf
    Then the reply says "Compiled on Overleaf with 1 error; a PDF was still produced."
    And the reply says "./main.tex:3: Undefined control sequence."
    And the reply says "LaTeX Warning: Reference `fig:missing' on page 1 undefined"

  Scenario: Bibliography problems found by BibTeX are reported
    Given BibTeX could not open "refs.bib" and found no entry for "smith2020"
    When I compile the project on Overleaf
    Then the reply says "Compiled on Overleaf with 1 error; a PDF was still produced."
    And the reply says "I couldn't open database file refs.bib"
    And the reply names the missing bibliography entry "smith2020"

  Scenario: A failed build says no PDF was produced, shows the end of the log, and leaves no PDF behind
    Given an earlier compile on Overleaf saved a PDF
    And the next compile fails with "Emergency stop." and produces no PDF
    When I compile the project on Overleaf
    Then the reply says "FAILED to compile on Overleaf: no PDF was produced."
    And the reply says "Emergency stop."
    But the reply does not say "Saved the PDF"
    And the build directory holds no PDF

  Scenario Outline: A compile Overleaf did not finish is explained
    Given Overleaf answers the next compile with the status "<status>" and no PDF
    When I compile the project on Overleaf
    Then the reply says "<explanation>"

    Examples:
      | status                 | explanation                                                     |
      | timedout               | The compile ran past Overleaf's time limit for this account's plan. |
      | rate-limited           | Overleaf is rate-limiting compiles for this account.            |
      | compile-in-progress    | Another compile of this project is still running in Overleaf.   |
      | stopped-on-first-error | FAILED to compile on Overleaf: stopped at the first error.      |

  Scenario: One too-recently-compiled refusal is waited out
    Given Overleaf refuses the next 1 compile because the project was compiled moments ago
    When I compile the project on Overleaf
    Then the reply says "Compiled on Overleaf."
    And Overleaf was asked to compile 2 times

  Scenario: A second refusal in a row is reported instead of retried forever
    Given Overleaf refuses the next 2 compiles because the project was compiled moments ago
    When I compile the project on Overleaf
    Then the reply says "Overleaf refused because the project was compiled moments ago."
    And Overleaf was asked to compile 2 times

  Scenario: A chosen root document and draft mode are passed to Overleaf
    When I compile "thesis.tex" on Overleaf in draft mode
    Then Overleaf was asked to compile "thesis.tex" in draft mode

  Scenario: The PDF and the log are saved in the build directory, and the reply gives their paths
    When I compile the project on Overleaf
    Then the reply says the PDF was saved as "output.pdf" in the build directory
    And the reply says the log was saved as "output.log" in the build directory
    And the build directory holds the PDF Overleaf built

  Scenario: An earlier PDF in the build directory is replaced
    Given the build directory already holds an older PDF
    When I compile the project on Overleaf
    Then the build directory holds the PDF Overleaf built

  Scenario: A file there that is not a PDF is never overwritten
    Given the build directory holds my notes where the PDF goes
    When I compile the project on Overleaf
    Then the reply says "already exists and is not a PDF"
    And the build directory still holds my notes where the PDF goes
