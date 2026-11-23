Feature: Compiling locally catches a broken paper before co-authors see it

  compile_project runs latexmk on the clone as it stands, local edits included, and reports
  what went wrong. Build files are kept outside the clone so they can never be pushed. These
  scenarios need latexmk and a TeX distribution, and are skipped on a machine without them.

  Background:
    Given the co-author has published a paper that compiles

  Scenario: A healthy paper compiles and leaves nothing to push
    When I compile the project
    Then the report says "Compiled main.tex."
    And the clone holds no PDF, aux or log file
    And there is nothing pending

  Scenario: A local edit that breaks the build is caught before it is pushed
    When I replace the paper locally with one that uses an undefined command
    And I compile the project
    Then the report says "FAILED to compile main.tex."
    And the report lists the errors
    But Overleaf still holds the paper that compiles

  Scenario: Only what the final pass still warns about is reported
    When I cite one entry that exists and one that does not
    And I compile the project
    Then the report says "Compiled main.tex."
    And the report warns that "nobody2000" is undefined
    But the report does not mention "knuth1984"
    And the report does not mention "Rerun to get cross-references right"

  Scenario: Compiling an included file explains that it is not the root document
    When I compile the project starting from "notes.tex"
    Then the report says "notes.tex has no \begin{document}"
    And the report suggests passing mainTexFile
