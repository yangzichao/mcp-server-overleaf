Feature: Projects can be archived or trashed for this account, and brought back

  Overleaf keeps an archive and a trash for each account. manage_project moves a project into
  or out of them with archive, unarchive, trash and untrash. Nothing is deleted, and
  co-authors' project lists stay as they were.

  Background:
    Given I am signed in to Overleaf
    And the account holds "Shared Thesis", which I was invited to edit, and "Grant Proposal", which I may only view

  Scenario: An archived project leaves the main list for the archived one
    When I "archive" "Shared Thesis"
    Then the reply says Overleaf archived "Shared Thesis" for this account only
    And "Shared Thesis" is not in the account's "main" list
    But "Shared Thesis" is in the account's "archived" list

  Scenario: Unarchiving brings a project back to the main list
    Given "Shared Thesis" is in the account's "archived" list
    When I "unarchive" "Shared Thesis"
    Then the reply says "is back in the dashboard's main list."
    And "Shared Thesis" is in the account's "main" list

  Scenario: A trashed project is kept, and untrash brings it back
    When I "trash" "Shared Thesis"
    Then the reply says "nothing was deleted, and untrash brings it back."
    And "Shared Thesis" is in the account's "trashed" list
    When I "untrash" "Shared Thesis"
    Then "Shared Thesis" is in the account's "main" list

  Scenario: A project I may only view can still be archived, since the archive is mine
    When I "archive" "Grant Proposal"
    Then the reply is not an error
    And "Grant Proposal" is in the account's "archived" list

  Scenario Outline: A project already where the action would put it is left alone
    Given "Shared Thesis" is in the account's "<list>" list
    When I "<action>" "Shared Thesis"
    Then the reply says "<reply>"
    And Overleaf was never asked to move a project

    Examples:
      | list     | action    | reply                                                  |
      | archived | archive   | is already in this account's archive; nothing changed. |
      | main     | unarchive | is not in this account's archive; nothing changed.     |
      | trashed  | trash     | is already in this account's trash; nothing changed.   |
      | main     | untrash   | is not in this account's trash; nothing changed.       |
