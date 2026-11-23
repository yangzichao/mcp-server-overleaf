Feature: Replacing text changes exactly the snippet asked for

  edit_file (action replace_text) is the narrowest edit there is: nothing outside the snippet
  is touched. A snippet that is missing, or that appears more than once, is refused and changes
  nothing, instead of changing a guess.

  Background:
    Given the co-author has published a paper reporting a sample size of 5000

  Scenario: The snippet is replaced and the rest of the file is left alone
    When I replace "5000" with "8000" in "main.tex"
    Then the reply says "Replaced 1 occurrence(s) in main.tex."
    And "main.tex" reads back as published, except "5000" became "8000"

  Scenario: Text that is not in the file changes nothing
    When I replace "4000" with "8000" in "main.tex"
    Then the replacement is refused with "Text not found in main.tex. Nothing was changed."
    And there is nothing pending

  Scenario: Text that appears more than once is not guessed at
    Given the co-author has published "todo.tex" with "TODO" written twice
    When I replace "TODO" with "Done" in "todo.tex"
    Then the replacement is refused with "Text appears 2 times in todo.tex. Nothing was changed."
    And there is nothing pending

  Scenario: Every occurrence is replaced when that is asked for
    Given the co-author has published "todo.tex" with "TODO" written twice
    When I replace every "TODO" with "Done" in "todo.tex"
    Then the reply says "Replaced 2 occurrence(s) in todo.tex."
    And "todo.tex" no longer contains "TODO"

  Scenario: The replacement is inserted exactly as written
    When I replace "5000" with "$& people" in "main.tex"
    Then "main.tex" contains "The sample size is $& people."
