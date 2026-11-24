Feature: Text can be added to the end of a file without rewriting it

  edit_file (action append) adds text after a file's last line, for a new bibliography entry
  or a closing note, and leaves every line above it as it was. Like the other edits, it stays
  on this computer until push_changes publishes it.

  Background:
    Given the co-author has published "refs.bib" with one entry and no newline after it
    And "notes.tex", which ends with a newline

  Scenario: The appended text starts on a line of its own
    When I append "@article{second, title = {Second}}" to "refs.bib"
    Then the reply says "Appended 1 line to the end of refs.bib."
    And "refs.bib" reads its first entry, then "@article{second, title = {Second}}" on the next line
    But Overleaf's "refs.bib" still holds only its first entry

  Scenario: Pushing publishes the appended text
    When I append "@article{second, title = {Second}}" to "refs.bib"
    And I push the work as "Cite the second paper"
    Then Overleaf's "refs.bib" ends with "@article{second, title = {Second}}"

  Scenario: No blank line is added to a file that already ends with a newline
    When I append "A second note." to "notes.tex"
    Then "notes.tex" reads its old line, then "A second note." right after it

  Scenario: A file that does not exist is not created
    When I append "Hello." to "absent.tex"
    Then the reply is an error that says "use action write to create it"
    And nothing is pending

  Scenario: Appending nothing changes nothing
    When I append "" to "notes.tex"
    Then the reply says "content is empty, so nothing was appended to notes.tex."
    And nothing is pending

  Scenario: The text to append is required
    When I append to "notes.tex" without giving any text
    Then the reply is an error that says "append needs content."
