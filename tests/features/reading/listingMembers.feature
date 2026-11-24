Feature: The people who share the project can be listed

  read_project (view members) reads what Overleaf's Share menu shows: the owner, each
  collaborator with their access, and, for the owner only, the invitations nobody has accepted
  yet. It needs a session cookie, because the Git bridge knows nothing about who shares a
  project.

  Scenario: The owner sees every collaborator and the invitations still pending
    Given I am signed in to Overleaf
    When I list the project's members
    Then the reply reads:
      """
      Members of "Fake paper":
      Owner: You Example <you@example.com> (this account)
      Collaborators (2):
      - Ada Example <ada@example.com> — can edit
      - Bea Example <bea@example.com> — can review
      Pending invitations (1):
      - invited.coauthor@example.com — can edit
      Anyone who joined through a sharing link is not listed; Overleaf's Share menu shows them, and sharing is changed there, not through this server.
      """

  Scenario: A collaborator sees who owns the project, but not the invitations
    Given I am signed in to Overleaf
    And my access to the project is "readAndWrite"
    When I list the project's members
    Then the reply says "Owner: Olga Example <olga@example.com>"
    And the collaborators listed are:
      | collaborator                  | access     |
      | You Example <you@example.com> | can edit   |
      | Ada Example <ada@example.com> | can edit   |
      | Bea Example <bea@example.com> | can review |
    And the reply says "Pending invitations: Overleaf shows them only to the project's owner, and this account is not the owner."
    And Overleaf was never asked for the invitations

  Scenario: The members view is about the whole project, not one file
    Given I am signed in to Overleaf
    When I list the members of "main.tex"
    Then the reply is an error
    And the reply says "path does not apply to members; outline, changes and word_count use it."
