Feature: A file can be put back to an earlier version, locally until pushed

  manage_files (action restore) brings back exactly what a file held at an earlier commit,
  figures included. Like any edit it waits in the local clone until it is pushed.

  Background:
    Given the co-author wrote a first draft, added a plot, then rewrote the draft

  Scenario: Restoring the first draft waits in the clone until it is pushed
    When I restore "main.tex" to the first draft
    Then the reply says "Restored main.tex to revision"
    And "main.tex" reads back as the first draft
    And the pending diff shows "+First draft."
    But Overleaf still holds the rewritten draft

  Scenario: Pushing a restore publishes the earlier version
    When I restore "main.tex" to the first draft
    And I push the work as "Go back to the first draft"
    Then Overleaf holds the first draft

  Scenario: A deleted figure comes back byte for byte
    Given the co-author has since deleted "figures/plot.png"
    When I restore "figures/plot.png" to the commit that added it
    And I push the work as "Bring the plot back"
    Then Overleaf holds the plot's exact bytes at "figures/plot.png"

  Scenario: Restoring a file that did not exist at that commit is refused
    When I restore "figures/plot.png" to the first draft
    Then the restore is refused because the file "did not exist at revision"
    And the refusal points to "manage_files with action delete" for removing a file
    And there is nothing pending
