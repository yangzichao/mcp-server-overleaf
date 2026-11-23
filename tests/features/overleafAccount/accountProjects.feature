Feature: The projects in the Overleaf account can be found and started from here

  list_projects reports the projects configured for this server and, with a session cookie,
  the whole account the way Overleaf's dashboard shows it. manage_project (action create)
  starts a new one, so a paper nobody registered here can still be reached.

  Background:
    Given I am signed in to Overleaf
    And the account holds "Fake paper", which I own, "Shared Thesis", which I was invited to edit, and "Grant Proposal", which I may only view

  Scenario: Every project is listed with my access and its address
    When I list the projects in the account
    Then the reply says "3 projects in the account:"
    And "Fake paper" is listed as "owner" at its Overleaf address
    And "Shared Thesis" is listed as "can edit" at its Overleaf address
    And "Grant Proposal" is listed as "can view" at its Overleaf address

  Scenario: A project this server already knows is marked with its registered name
    When I list the projects in the account
    Then "Fake paper" is marked as registered here as "paper"

  Scenario Outline: Each access level is named the way a person would say it
    Given the account also holds "Lab Notes" with the access level "<accessLevel>"
    When I list the projects in the account
    Then "Lab Notes" is listed as "<shownAs>" at its Overleaf address

    Examples:
      | accessLevel  | shownAs    |
      | owner        | owner      |
      | readWrite    | can edit   |
      | readAndWrite | can edit   |
      | review       | can review |
      | readOnly     | can view   |

  Scenario: The list can be narrowed by part of a name, ignoring case
    When I list the projects in the account whose name contains "THESIS"
    Then the reply says "1 project in the account:"
    And "Shared Thesis" is listed
    But "Grant Proposal" is not listed

  Scenario: A filter that matches nothing says so
    When I list the projects in the account whose name contains "nothing like this"
    Then the reply says no project in the account has "nothing like this" in its name

  Scenario: A new project is created and its address returned
    When I create a project named "New Paper"
    Then the reply gives the Overleaf address of the new project "New Paper"
    And the account now holds a project named "New Paper"

  Scenario: A new project can start from Overleaf's example paper
    When I create a project named "Example Paper" from the "example" template
    Then the account now holds a project named "Example Paper" made from the example paper

  Scenario: Spaces around the name are left out
    When I create a project named "  New Paper  "
    Then the account now holds a project named "New Paper"

  Scenario: A blank name is refused before Overleaf is asked
    When I create a project named "   "
    Then the reply says the name is too short
    And Overleaf was never asked to create a project
