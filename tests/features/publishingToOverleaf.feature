Feature: Publishing to Overleaf is a separate, deliberate step

  This server edits a local clone, never Overleaf itself. A co-author sees nothing until
  push_changes runs, and a push that would overwrite their newer work is refused rather
  than merged by guesswork.

  Background:
    Given the co-author has published a paper reporting a sample size of 5000

  Scenario: An edit waits in the clone until it is pushed
    When I correct the sample size to 8000
    Then the pending diff shows the corrected sample size
    But Overleaf still reports 5000

  Scenario: Pushing publishes the edit and records the reason
    When I correct the sample size to 8000
    And I push the work as "Correct the sample size"
    Then Overleaf reports the corrected sample size
    And the Overleaf history records "Correct the sample size"

  Scenario: Discarding local work restores the published version
    When I correct the sample size to 8000
    And I discard the local changes
    Then the project reads back the published sample size
    And there is nothing left to push

  Scenario: A push that would overwrite the co-author is refused
    When I correct the sample size to 8000
    And the co-author publishes a sample size of 20000
    And I push the work as "Our own correction"
    Then the push is refused
    And Overleaf keeps the co-author's sample size
    And the Overleaf history does not record "Our own correction"

  Scenario: Work that does not collide is rebased onto the co-author's
    When I rewrite the conclusion
    And the co-author publishes a new file "appendix.tex"
    And I push the work as "Rewrite the conclusion"
    Then the push succeeds
    And Overleaf holds the rewritten conclusion
    And Overleaf holds "appendix.tex"

  Scenario: A deleted file stays in Overleaf until the deletion is pushed
    When I delete "notes.tex"
    Then the reply says the file is still in Overleaf
    And Overleaf holds "notes.tex"

  Scenario: Pushing a deletion removes the file for everyone
    When I delete "notes.tex"
    And I push the work as "Remove the shared notes"
    Then Overleaf no longer holds "notes.tex"

  Scenario: Renaming a file warns that LaTeX references are not rewritten
    When I move "notes.tex" to "sections/notes.tex"
    Then the reply tells me to search for the old path before pushing
    And Overleaf holds "notes.tex"
