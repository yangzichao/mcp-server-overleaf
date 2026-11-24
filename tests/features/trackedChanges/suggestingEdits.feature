Feature: A suggested edit waits in the review panel for a co-author to decide

  An edit through the Git bridge always lands as finished text. manage_tracked_changes (action
  suggest) goes through Overleaf's editor instead, so the change arrives in the review panel as
  a tracked change, and the accepted text of the paper stays as it was until someone accepts
  it.

  Background:
    Given I am signed in to Overleaf with a paper whose third line reads "Hello world."

  Scenario: A suggestion arrives in the review panel at once
    When I suggest replacing "Hello world." with "Hello, brave new world."
    Then the reply says the suggestion is waiting in the review panel
    And the review panel lists 2 tracked changes in "main.tex"
    And the review panel shows a suggested deletion of "Hello world." on line 3
    And the review panel shows a suggested insertion of "Hello, brave new world." on line 3

  Scenario: The Git bridge keeps the text nobody has accepted yet
    When I suggest replacing "Hello world." with "Hello, brave new world."
    Then reading "main.tex" through the Git bridge still gives "Hello world."

  Scenario: An empty replacement suggests a deletion and nothing more
    When I suggest replacing "Hello world." with ""
    Then the review panel lists 1 tracked change in "main.tex"
    And the review panel shows a suggested deletion of "Hello world." on line 3

  Scenario: A document nobody has touched has nothing to review
    When I list the tracked changes in "main.tex"
    Then the reply says "No tracked changes in main.tex."

  Scenario: A collaborator's suggestion is listed with who made it
    Given a collaborator has suggested inserting "big " before "world"
    When I list the tracked changes in "main.tex"
    Then the reply lists a suggested insertion of "big " by the collaborator

  Scenario: Text that appears twice is refused rather than guessed at
    Given the project has a document "repeats.tex" with "the same line" on two lines
    When I suggest replacing "the same line" with "a different line" in "repeats.tex"
    Then the reply says the text appears more than once
    And Overleaf holds 0 tracked changes in "repeats.tex"

  Scenario: Text that is not in the paper is refused
    When I suggest replacing "Goodbye world." with "Farewell world."
    Then the reply says the text does not appear in the document
    And Overleaf holds 0 tracked changes in "main.tex"

  Scenario: A wrong path is answered with the documents that do exist
    When I list the tracked changes in "nope.tex"
    Then the reply says there is no editable document at "nope.tex"
    And the reply names "main.tex" as a document that exists

  Scenario: A document in Overleaf's newer history-OT format is explained
    Given Overleaf keeps "main.tex" in the newer history-OT format
    When I list the tracked changes in "main.tex"
    Then the reply explains the history-OT format and points to the Git-bridge tools

  Scenario Outline: Any account that can review may suggest, and read-only access is refused
    Given my access to the project is "<access>"
    When I suggest replacing "Hello world." with "Goodbye world."
    Then the suggestion is "<outcome>"

    Examples:
      | access       | outcome  |
      | owner        | recorded |
      | readAndWrite | recorded |
      | review       | recorded |
      | readOnly     | refused  |
