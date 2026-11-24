Feature: A project can be copied, or renamed by its owner

  manage_project (action copy) makes a new project this account owns from any project it can
  open, and leaves the original as it was. Action rename changes the name the dashboard shows;
  Overleaf lets only the owner do that, and the project keeps its address.

  Background:
    Given I am signed in to Overleaf
    And the account holds "Fake paper", which I own, and "Shared Thesis", which I was invited to edit

  Scenario: A copy is a new project this account owns
    When I copy "Shared Thesis" as "Thesis backup"
    Then the reply gives the Overleaf address of the copy "Thesis backup" of "Shared Thesis"
    And the reply says "owned by this account; the original is unchanged."
    And the account owns a project named "Thesis backup"
    And the account still holds "Shared Thesis"

  Scenario: A copy needs a name
    When I copy "Shared Thesis" without a name
    Then the reply is an error
    And the reply says "copy needs name."

  Scenario: The owner renames a project, which keeps its address
    When I rename "Fake paper" to "Final Paper"
    Then the reply says "Fake paper" became "Final Paper" at the same Overleaf address
    And the account holds "Final Paper" in place of "Fake paper"

  Scenario: Renaming to the name it already has changes nothing
    When I rename "Fake paper" to "Fake paper"
    Then the reply says '"Fake paper" already has that name; nothing changed.'
    And Overleaf was never asked to rename a project

  Scenario: Only the owner may rename a project
    When I rename "Shared Thesis" to "Mine now"
    Then the reply is an error
    And the reply says 'Only the owner of "Shared Thesis" can rename it; this account can edit it.'
    And Overleaf was never asked to rename a project
    And the account still holds "Shared Thesis"
