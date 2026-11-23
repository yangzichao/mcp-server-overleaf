Feature: A section or a whole file can be rewritten, locally until pushed

  edit_file (action replace_section) rewrites one section by its title and leaves the headings
  around it alone. edit_file (action write) creates a file or replaces one entirely. Both write
  only the local clone, and neither can write outside the project.

  Background:
    Given the co-author has published a paper reporting a sample size of 5000

  Scenario: Rewriting a section keeps the sections around it
    When I rewrite the "Introduction" section to say "We surveyed 8000 people."
    Then the reply says "Replaced \section{Introduction} (lines 3-4) in main.tex."
    And "main.tex" contains "We surveyed 8000 people."
    And "main.tex" still contains "\section{Conclusion}" and "\end{document}"
    But "main.tex" no longer contains "5000"

  Scenario: Rewriting a section that does not exist changes nothing
    When I rewrite the "Results" section to say "Nothing."
    Then the rewrite is refused with "Available: Introduction, Conclusion"
    And there is nothing pending

  Scenario: Writing a new file creates it and its folder in the local clone only
    When I write "sections/related.tex" containing "Related work."
    Then the reply says "Created sections/related.tex."
    And "sections/related.tex" contains "Related work."
    But Overleaf does not hold "sections/related.tex"

  Scenario: Writing an existing file replaces all of it
    When I write "notes.tex" containing "New notes."
    Then the reply says "Overwrote notes.tex."
    And "notes.tex" no longer contains "Shared notes"

  Scenario Outline: A write that would land outside the project is refused
    When I write "<path>" containing "Should never be written."
    Then the write is refused with "<reason>"
    And there is nothing pending

    Examples:
      | path             | reason                               |
      | /tmp/outside.tex | must be relative to the project root |
      | ../outside.tex   | resolves outside the project         |
      | .git/config      | Refusing to touch the .git directory |
