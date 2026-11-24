Feature: Each line of a file can be traced to the commit that last changed it

  read_history (view blame) puts beside every line the commit that last changed it, with its
  day and author, then lists those commits newest first. A line changed here and not pushed
  yet has no commit, and is marked as such.

  Background:
    Given the co-author wrote a three-line draft on 2026-03-01 and rewrote only its second line on 2026-03-02

  Scenario: Every line names the commit that last changed it
    When I blame "main.tex"
    Then the reply says "main.tex, lines 1-3, each with the commit that last changed it:"
    And the lines are blamed as:
      | line | commit            | day        | author         | text                       |
      | 1    | First draft       | 2026-03-01 | A Collaborator | We study sample sizes.     |
      | 2    | Rewrite the intro | 2026-03-02 | A Collaborator | Second draft, much better. |
      | 3    | First draft       | 2026-03-01 | A Collaborator | The end.                   |
    And the commits are listed newest first as "Rewrite the intro", then "First draft"
    And no line is marked "not committed yet"

  Scenario: Only the lines asked for are blamed
    When I blame line 2 of "main.tex"
    Then the reply says "main.tex, lines 2-2, each with the commit that last changed it:"
    And the lines are blamed as:
      | line | commit            | day        | author         | text                       |
      | 2    | Rewrite the intro | 2026-03-02 | A Collaborator | Second draft, much better. |
    But the reply does not mention "We study sample sizes."

  Scenario: A line edited here and not pushed yet is marked as not committed
    When I replace "The end." with "The real end." in "main.tex"
    And I blame "main.tex"
    Then line 3 reads "The real end." and is marked "not committed yet"
    And the reply says "Lines marked not committed yet were changed in the clone and are not pushed."

  Scenario: Blame needs the file to trace
    When I blame without naming a file
    Then the reply is an error that says "blame needs path."

  Scenario: A line range applies to blame only
    When I list the commits starting from line 2
    Then the reply is an error that says "startLine does not apply to commits; blame uses it."
