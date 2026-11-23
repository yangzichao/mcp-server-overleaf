Feature: Reading a file shows Overleaf's latest version and nothing outside the project

  Every read pulls from Overleaf first, so the assistant never works from a stale copy of
  the paper. A read can only reach files inside the project.

  Background:
    Given the co-author has published a paper and shared notes

  Scenario: Listing the files names the likely main document
    When I list the project's files
    Then the reply says "2 tracked files. Likely main document: main.tex"
    And the reply lists "main.tex" and "notes.tex" as LaTeX sources

  Scenario: A file created here is listed only when local files are asked for
    When I create "draft.tex" in the local clone
    Then listing the files does not show "draft.tex"
    But listing the files with local files included shows "draft.tex (untracked)"

  Scenario: The co-author's newest version is the one that gets read
    When the co-author changes the conclusion to "Written by the co-author."
    And I read "main.tex"
    Then the reply says "Written by the co-author."

  Scenario Outline: A line range comes back numbered and clamped to the file
    When I read lines <first> to <last> of "main.tex"
    Then the reply shows lines <first> to <shownLast>, each prefixed with its number

    Examples:
      | first | last | shownLast |
      | 3     | 4    | 4         |
      | 6     | 99   | 7         |

  Scenario: Line numbers match the file's own lines
    When I read lines 4 to 4 of "main.tex"
    Then line 4 reads "The sample size is 5000."

  Scenario: A file that does not exist is reported, not invented
    When I read "missing.tex"
    Then the read fails and names "missing.tex"

  Scenario Outline: A path outside the project is refused
    When I read "<path>"
    Then the read fails with "<reason>"

    Examples:
      | path                   | reason                                |
      | ../../../../etc/passwd | resolves outside the project          |
      | /etc/passwd            | must be relative to the project root  |
      | .git/config            | Refusing to touch the .git directory  |

  Scenario: The summary counts the files and finds the main document
    When I ask for the project summary
    Then the summary reports 2 files, all of them LaTeX sources
    And the summary names "main.tex" as the main document with 2 sections
