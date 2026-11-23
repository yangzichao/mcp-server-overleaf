Feature: Removing and renaming files is reversible until it is pushed

  The publishing feature covers what Overleaf sees after a deletion or a rename. These are
  the cases around it: a path that is not there, a destination that is taken, and taking a
  deletion back.

  Background:
    Given the co-author has published a paper and shared notes

  Scenario: Deleting a file that is not in the project deletes nothing
    When I delete "missing.tex"
    Then the reply says "missing.tex is not in the project, so there is nothing to delete."
    And there is nothing pending

  Scenario: The pending diff shows a deletion before it is pushed
    When I delete "notes.tex"
    Then the pending diff shows "notes.tex" as deleted

  Scenario: Discarding local changes brings a deleted file back
    When I delete "notes.tex"
    And I discard the local changes
    Then "notes.tex" reads back the co-author's notes

  Scenario: Moving onto a file that already exists is refused and keeps both
    When I move "notes.tex" to "main.tex"
    Then the move is refused with "main.tex already exists. Nothing was moved."
    And "notes.tex" reads back the co-author's notes
    And there is nothing pending

  Scenario: Moving a file that is not in the project is refused
    When I move "missing.tex" to "sections/missing.tex"
    Then the move is refused with "missing.tex is not in the project, so there is nothing to move."
    And there is nothing pending

  Scenario: Pushing a rename publishes the file under its new path only
    When I move "notes.tex" to "sections/notes.tex"
    And I push the work as "Move the notes"
    Then Overleaf holds "sections/notes.tex" with the co-author's notes
    But Overleaf no longer holds "notes.tex"
