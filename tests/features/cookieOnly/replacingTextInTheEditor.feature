Feature: Without Git integration, edit_file replaces text in Overleaf directly

  With only a session cookie there is no clone to keep an edit in, so edit_file (action
  replace_text) changes the document in Overleaf at once. It arrives as ordinary text, not as
  a suggestion, and there is no push_changes step and no undo here.

  Background:
    Given the server was given "only a session cookie"

  Scenario: A replacement is in Overleaf at once, as ordinary text
    When I replace "Hello world." with "Hello, brave new world." in "main.tex"
    Then the reply says "Replaced 1 occurrence(s) in main.tex"
    And Overleaf's copy of "main.tex" reads "Hello, brave new world." on line 3
    And the review panel of "main.tex" holds no suggestions

  Scenario: Text that appears several times is left alone unless every occurrence is asked for
    Given the project has a document "repeats.tex" reading "x and x and x"
    When I replace "x" with "y" in "repeats.tex"
    Then the reply says "appears 3 times"
    And the reply is an error
    And Overleaf's copy of "repeats.tex" reads "x and x and x" on line 1

  Scenario: Every occurrence is replaced when asked
    Given the project has a document "repeats.tex" reading "x and x and x"
    When I replace every "x" with "yy" in "repeats.tex"
    Then Overleaf's copy of "repeats.tex" reads "yy and yy and yy" on line 1

  Scenario: Text that is not in the document changes nothing
    When I replace "Goodbye world." with "Farewell." in "main.tex"
    Then the reply says "Text not found in main.tex. Nothing was changed."
    And the reply is an error
    And the paper is unchanged

  Scenario: Text in other scripts, accents and maths is stored as written
    When I replace "Hello world." with "第一节：方法, café, $$x^2$$" in "main.tex"
    Then Overleaf's copy of "main.tex" reads "第一节：方法, café, $$x^2$$" on line 3

  Scenario Outline: Only an account that may edit can replace text
    Given my access to the project is "<access>"
    When I replace "Hello world." with "Goodbye." in "main.tex"
    Then the replacement is "<outcome>"

    Examples:
      | access       | outcome                                     |
      | owner        | made                                        |
      | readAndWrite | made                                        |
      | review       | refused, pointing to manage_tracked_changes |
      | readOnly     | refused as read-only                        |

  Scenario: A reviewer hears about a wrong snippet the same way an editor does
    Given my access to the project is "review"
    When I replace "Not in the paper." with "Goodbye." in "main.tex"
    Then the reply says "Text not found in main.tex"
    And the reply is an error
