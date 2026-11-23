Feature: An edit based on an outdated read is refused

  The assistant can hand back the revision read_file gave it. If a co-author changed the
  file since that read, the edit is refused and nothing is written, instead of overwriting
  work the assistant never saw.

  Background:
    Given the co-author has published a paper reporting a sample size of 5000
    And I have read "main.tex" and kept its revision

  Scenario Outline: Every kind of edit is refused once the co-author has changed the file
    Given the co-author then publishes a new conclusion
    When I make a <edit> to "main.tex" passing the revision I kept
    Then the edit is refused because the file changed since the read
    And there is nothing pending
    And "main.tex" reads back with the co-author's new conclusion

    Examples:
      | edit             |
      | text replacement |
      | section rewrite  |
      | whole-file write |

  Scenario: An edit against a file nobody has changed goes through
    When I make a text replacement to "main.tex" passing the revision I kept
    Then the edit is accepted

  Scenario: A guarded write to a file the co-author has since deleted is refused
    Given I have read "notes.tex" and kept its revision
    And the co-author then deletes "notes.tex"
    When I write "notes.tex" passing the revision I kept
    Then the write is refused because the file no longer exists
    And there is nothing pending
