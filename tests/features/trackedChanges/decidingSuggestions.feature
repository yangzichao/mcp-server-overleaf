Feature: Accepting or rejecting suggestions changes the paper for everyone

  Accepting a suggestion makes it part of the paper; rejecting it puts the paper back as it was.
  Either takes effect in Overleaf at once and cannot be undone from here, so both say exactly
  which suggestions they decided, and both are kept for accounts that may edit the paper.

  Background:
    Given I am signed in to Overleaf with a paper whose third line reads "Hello world."

  Scenario: Accepting every suggestion makes it the paper's text
    Given I have suggested replacing "Hello world." with "Hello, brave new world."
    When I accept every suggestion in "main.tex"
    Then the reply says 2 suggestions were accepted in "main.tex"
    And the paper reads "Hello, brave new world." on line 3
    And Overleaf holds no suggestions in "main.tex"

  Scenario: Accepting one suggestion by id leaves the others pending
    Given I have suggested replacing "Hello world." with "Hello, brave new world."
    When I accept only the suggested insertion
    Then the reply says 1 suggestion was accepted in "main.tex"
    And the only suggestion still pending is the deletion of "Hello world."

  Scenario: Rejecting every suggestion puts the paper back as it was
    Given I have suggested replacing "Hello world." with "Hello, brave new world."
    When I reject every suggestion in "main.tex"
    Then the reply says 2 suggestions were rejected in "main.tex"
    And the paper is exactly as it was before the suggestion
    And Overleaf holds no suggestions in "main.tex"

  Scenario: Rejecting one suggestion by id leaves the others pending
    Given I have suggested replacing "Hello world." with "Hello, brave new world."
    When I reject only the suggested insertion
    Then the paper no longer contains "brave new world"
    And the only suggestion still pending is the deletion of "Hello world."

  Scenario: Rejecting a suggested deletion brings the text back
    Given I have suggested replacing "Hello world." with ""
    When I reject every suggestion in "main.tex"
    Then the paper is exactly as it was before the suggestion

  Scenario: Rejecting suggestions on several lines restores every line
    Given the project has a document "methods.tex" reading "We sampled 50 people." then "We asked 3 questions."
    And I have suggested replacing "50" with "500" in "methods.tex"
    And I have suggested replacing "3 questions" with "4 questions" in "methods.tex"
    When I reject every suggestion in "methods.tex"
    Then "methods.tex" reads "We sampled 50 people." then "We asked 3 questions." again
    And Overleaf holds no suggestions in "methods.tex"

  Scenario: Rejecting a collaborator's suggestion does not leave a suggestion of my own
    Given a collaborator has suggested inserting "big " before "world"
    When I reject every suggestion in "main.tex"
    Then the reply names the rejected insertion of "big "
    And the paper is exactly as it was before the suggestion
    And Overleaf holds no suggestions in "main.tex"

  Scenario: An unknown suggestion id decides nothing at all
    Given I have suggested replacing "Hello world." with "Hello, brave new world."
    When I reject the suggested insertion together with the id "not-a-change"
    Then the reply says there is no tracked change "not-a-change" in "main.tex"
    And Overleaf still holds 2 suggestions in "main.tex"

  Scenario: Deciding needs either the ids or all of them, stated explicitly
    Given I have suggested replacing "Hello world." with "Hello, brave new world."
    When I accept suggestions in "main.tex" without naming any or asking for all
    Then the reply asks for either changeIds or all
    And Overleaf still holds 2 suggestions in "main.tex"

  Scenario: A document with no suggestions has nothing to decide
    When I accept every suggestion in "main.tex"
    Then the reply says there are no tracked changes in "main.tex"

  Scenario Outline: An account that may not edit cannot decide suggestions
    Given I have suggested replacing "Hello world." with "Hello, brave new world."
    And my access to the project becomes "<access>"
    When I "<decision>" every suggestion in "main.tex"
    Then the reply says the account has "<wording>" access and needs edit access
    And Overleaf still holds 2 suggestions in "main.tex"

    Examples:
      | access   | decision | wording   |
      | review   | accept   | review    |
      | review   | reject   | review    |
      | readOnly | accept   | read-only |
      | readOnly | reject   | read-only |

  Scenario Outline: An account that may edit can decide suggestions
    Given my access to the project is "<access>"
    And I have suggested replacing "Hello world." with "Hello, brave new world."
    When I "<decision>" every suggestion in "main.tex"
    Then Overleaf holds no suggestions in "main.tex"

    Examples:
      | access       | decision |
      | owner        | accept   |
      | readAndWrite | accept   |
      | readAndWrite | reject   |
