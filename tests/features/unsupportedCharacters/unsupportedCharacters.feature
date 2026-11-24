Feature: Characters Overleaf's editor cannot store are refused before the paper changes

  Overleaf's editor turns emoji and other characters outside the Basic Multilingual Plane into
  the replacement character as they arrive. Rather than leave that in the paper,
  manage_tracked_changes (action suggest) and edit_file (action replace_text) refuse them, name
  the character, and change nothing. A LaTeX command writes the same symbol.

  Background:
    Given the server was given "only a session cookie"

  Scenario Outline: A character outside the Basic Multilingual Plane is refused by name
    When I ask "<edit>" to replace "Hello world." with "<replacement>"
    Then the change is refused, naming "<codePoint>"
    And the paper is unchanged
    And Overleaf holds no suggestions in "main.tex"

    Examples:
      | edit                           | replacement | codePoint |
      | edit_file replace_text         | Hello 😀.   | U+1F600   |
      | manage_tracked_changes suggest | Hello 😀.   | U+1F600   |
      | edit_file replace_text         | Let 𝔸 be.   | U+1D538   |
      | manage_tracked_changes suggest | Let 𝒞 be.   | U+1D49E   |

  Scenario Outline: A NUL character is refused
    When I ask "<edit>" to replace "Hello world." with text containing a NUL character
    Then the change is refused, naming "NUL"
    And the paper is unchanged

    Examples:
      | edit                           |
      | edit_file replace_text         |
      | manage_tracked_changes suggest |

  Scenario: The refusal says to write a LaTeX command instead
    When I ask "edit_file replace_text" to replace "Hello world." with "Let 𝔸 be."
    Then the reply says "Write it as a LaTeX command instead"

  Scenario Outline: Characters inside the Basic Multilingual Plane are accepted
    When I ask "<edit>" to replace "Hello world." with "第一节 café ∑ — ü"
    Then the reply is not an error
    And Overleaf's copy of "main.tex" now holds "第一节 café ∑ — ü"

    Examples:
      | edit                           |
      | edit_file replace_text         |
      | manage_tracked_changes suggest |
