Feature: The project's history can be read back, one commit at a time

  Overleaf's Git bridge records who changed what and when. The assistant can list that
  history, read a file as it was at any commit, and compare two points in it.

  Background:
    Given the co-author wrote a first draft, added a plot, then rewrote the draft

  Scenario: The history lists commits newest first, with author and changed files
    When I list the project's history
    Then the reply says "3 commits for the project, newest first:"
    And the commits are listed in this order:
      | subject           |
      | Rewrite the intro |
      | Add the plot      |
      | First draft       |
    And the history names "A Collaborator" as the author
    And the history says "added figures/plot.png"

  Scenario: Asking for the commits view by name gives the same list
    When I list the project's history through the commits view
    Then the reply says "3 commits for the project, newest first:"
    And the commits are listed in this order:
      | subject           |
      | Rewrite the intro |
      | Add the plot      |
      | First draft       |

  Scenario: The history of one file leaves out commits that did not touch it
    When I list the history of "main.tex"
    Then the reply says "2 commits for main.tex"
    But the history does not mention "Add the plot"

  Scenario: Work pushed from here appears in the history
    When I replace "Second draft" with "Third draft" in "main.tex"
    And I push the work as "Third draft of the intro"
    And I list the project's history
    Then the reply says "4 commits for the project"
    And the commits start with "Third draft of the intro"

  Scenario: An unpushed edit holds back the pull, so the history is refused and the edit is kept
    When I replace "Second draft" with "Third draft" in "main.tex"
    And the co-author has since added "sections/results.tex"
    And I try to list the project's history
    Then the history is refused with "Cannot synchronize with Overleaf. Local work has been preserved. Review it with read_project (view changes), then publish it with push_changes or explicitly discard it with manage_files (action discard_local_changes)."
    And blaming "main.tex" is refused the same way
    And the pending diff still shows "+Third draft, much better."

  Scenario: A file can be read as it was at an earlier commit
    When I read "main.tex" as it was in the first draft
    Then the reply is exactly the first draft

  Scenario: An earlier version can be read with line numbers
    When I read "main.tex" from line 2 as it was in the first draft
    Then the reply is exactly line 2 "First draft." followed by an empty line 3

  Scenario: A commit that does not exist is reported, pointing at read_history
    When I read "main.tex" as it was at commit "deadbeef"
    Then the reply says "No commit deadbeef in this project's history. read_history shows the revisions that exist."

  Scenario: A file that did not exist yet is reported as such
    Given the co-author has since added "sections/results.tex"
    When I read "sections/results.tex" as it was in the first draft
    Then the reply says "sections/results.tex did not exist at revision"

  Scenario: A figure is read only as it is now, not as it was at a commit
    When I read "figures/plot.png" as it was at the commit that added it
    Then the reply says "figures/plot.png is an image, which read_file returns whole as it is now; revision applies to text files only."

  Scenario: Comparing the first draft with Overleaf's latest shows every change since
    When I compare the first draft with Overleaf's latest version
    Then the comparison shows "-First draft." and "+Second draft, much better."
    And the comparison mentions "figures/plot.png"

  Scenario: Comparing a commit with itself finds no differences
    When I compare the first draft with itself
    Then the reply says "No differences in the project"
