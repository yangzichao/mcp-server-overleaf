Feature: The clone stays in step with Overleaf without losing local work

  The server keeps a local clone of each paper. read_project (view status) pulls from Overleaf
  and says how the clone stands against it, and nothing in this feature ever drops an edit the
  assistant made or a commit the co-author published.

  Background:
    Given the co-author has published a paper reporting a sample size of 5000

  Scenario: A fresh clone has nothing to push
    When I ask for the project status
    Then the status reports "local commits not yet pushed: 0"
    And the status reports "files edited locally and not yet committed: 0"
    And pushing now reports "Nothing to push: there are no local changes."

  Scenario: The status names the file edited here
    When I correct the sample size to 8000
    And I ask for the project status
    Then the status reports "files edited locally and not yet committed: 1"
    And the status lists "main.tex" among the edited files

  Scenario: Syncing pulls in what the co-author published since the last read
    Given I have already opened the project
    When the co-author publishes a new file "appendix.tex"
    And I sync the project
    Then the sync reports "commits pulled from Overleaf just now: 1"
    And the sync reports "commits on Overleaf not yet merged in: 0"
    And the sync reports "local commits not yet pushed: 0"
    And the sync gives no warning
    And "appendix.tex" can be read

  Scenario: Syncing over unpushed edits is held back with a warning and keeps both versions
    When I correct the sample size to 8000
    And the co-author publishes a new file "appendix.tex"
    And I sync the project
    Then the sync warns "WARNING: synchronization could not finish. Local work was preserved; the clone is not up to date."
    And the sync reports "commits on Overleaf not yet merged in: 1"
    And the status reports "commits on Overleaf not yet merged in: 1"
    And the pending diff still shows "+The sample size is 8000."

  Scenario: Pushing the pending edit lets the co-author's new work be read
    When I correct the sample size to 8000
    And the co-author publishes a new file "appendix.tex"
    Then reading "appendix.tex" is refused while the edit is pending
    When I push the work as "Correct the sample size"
    Then "appendix.tex" can be read
    And Overleaf holds "8000" in "main.tex"

  Scenario: A refused push keeps the work for review, and discarding clears it
    When I correct the sample size to 8000
    And the co-author publishes a sample size of 20000
    And I push the work as "Our correction"
    Then the status reports "local commits not yet pushed: 1"
    And the pending diff still shows "+The sample size is 8000."
    When I discard the local changes
    Then the reply says "and 1 unpushed commit(s)"
    And "main.tex" reads back with the co-author's sample size of 20000
    And there is nothing pending

  Scenario: Discarding when nothing is pending says so
    When I discard the local changes
    Then the reply says "No local changes to discard."

  Scenario: The pending diff can be narrowed to one file
    When I correct the sample size to 8000
    And I write "notes.tex" containing "New notes."
    Then the pending diff for "notes.tex" leaves out "main.tex"
