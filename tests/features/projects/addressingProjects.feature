Feature: Every tool can work on any paper in the account

  One server reaches several papers. The `project` argument names one by its registered
  name, its Overleaf address or its 24-character id, and a call that names none uses the
  default. Work in one paper never touches another.

  Background:
    Given the account has the registered papers "paper" and "thesis", with "paper" as the default
    And it also has a paper nobody registered

  Scenario: The project list marks the default and says other papers can be named by address
    When I list the projects
    Then the list shows "- paper  (default)" and "- thesis"
    And the list says any other project can be given by its Overleaf address

  Scenario: A call that names no project uses the default
    When I read "main.tex" without naming a project
    Then the reply is "The paper."

  Scenario Outline: A paper can be named in every form a person has to hand
    When I read "main.tex" from the <paper> named by its <form>
    Then the reply is "<content>"

    Examples:
      | paper            | form              | content          |
      | thesis           | registered name   | The thesis.      |
      | unregistered one | Overleaf address  | The other paper. |
      | unregistered one | 24-character id   | The other paper. |

  Scenario: A name that matches nothing is refused with the ways to name a paper
    When I read "main.tex" from the project "my other paper"
    Then the call fails, naming "my other paper" as unknown and "paper, thesis" as the configured projects
    And the failure says a paper can be named "by its Overleaf address, or its 24-character id"

  Scenario: Discarding the work in one paper keeps the work in the other
    When I edit "main.tex" in "paper" and in "thesis"
    And I discard the local changes in "thesis"
    Then "thesis" has nothing pending
    But "paper" still has its edit pending

  Scenario: Pushing one paper publishes only that paper
    When I edit "main.tex" in "paper" and in "thesis"
    And I push "thesis" as "Revise the thesis"
    Then Overleaf holds the edit in "thesis"
    But Overleaf does not hold the edit in "paper"
    And "paper" still has its edit pending

  Scenario: With several papers and no default, a call must name one
    Given the server is restarted with no default project
    When I read "main.tex" without naming a project
    Then the call fails with "No project given and no default is configured."
