Feature: The owner shares a project by email address from here

  manage_project invites someone by email address, changes a member's access level, removes a
  member and withdraws a pending invitation, as Overleaf's Share menu does for people invited
  by address. Only the owner may, and anyone else is refused before anything is sent. An
  invitation reaches a real person, so it is never sent twice to the same address.

  Inviting someone, or giving a member more access, waits until I confirm it in my MCP client,
  which asks me through elicitation. The model cannot answer that question, so text planted in
  a paper cannot get the project shared. Taking access away asks nothing.

  Background:
    Given I am signed in to Overleaf from an MCP client that can ask me to confirm
    And Ada can edit the project, Bea can review it, and "invited.coauthor@example.com" has a pending invitation to edit it

  Scenario: An invitation goes out once I confirm it in my MCP client
    When I invite "new.coauthor@example.com" to review the project
    Then my MCP client asked me 'Send an Overleaf invitation for "Fake paper" to new.coauthor@example.com? Overleaf emails it at once, and once they accept it they can review the project. Confirm only if you asked for this invitation.'
    And the question had one box to tick, "Send the invitation"
    And the reply says 'Invited new.coauthor@example.com to "Fake paper" with access "can review".'
    And "new.coauthor@example.com" has a pending invitation to review the project

  Scenario Outline: An invitation I do not confirm is not sent
    Given I will answer what my MCP client asks me with "<answer>"
    When I invite "new.coauthor@example.com" to edit the project
    Then the reply is not an error
    And the reply says "The invitation to new.coauthor@example.com was not confirmed, so nothing was sent."
    And Overleaf was sent no invitation

    Examples:
      | answer                       |
      | decline                      |
      | dismiss                      |
      | accept with the box unticked |

  Scenario: An MCP client that cannot ask me sends me to the Share menu
    Given my MCP client cannot ask me anything
    When I invite "new.coauthor@example.com" to view the project
    Then the reply is an error
    And the reply says "This MCP client does not support elicitation, so the person using it cannot be asked to confirm"
    And the reply says 'Nothing was sent; invite new.coauthor@example.com from the Share menu of "Fake paper" in Overleaf instead.'
    And Overleaf was sent no invitation

  Scenario: The address is matched as Overleaf stores it, without case or spaces
    When I invite "  New.Coauthor@Example.com " to view the project
    Then "new.coauthor@example.com" has a pending invitation to view the project

  Scenario: Someone who is already a member is not invited again, and I am not asked
    When I invite "ADA@example.com" to view the project
    Then the reply is an error
    And the reply says 'Ada Example <ada@example.com> is already a member of "Fake paper" with access "can edit"; change that with set_access.'
    And my MCP client asked me nothing
    And Overleaf was sent no invitation

  Scenario: Someone already invited is not invited twice
    When I invite "invited.coauthor@example.com" to edit the project
    Then the reply is an error
    And the reply says "invited.coauthor@example.com already has a pending invitation"
    And Overleaf was sent no invitation

  Scenario: A plan with no seat left is reported, and a viewer still fits
    Given the owner's plan has no editor or reviewer seat left
    When I invite "new.coauthor@example.com" to edit the project
    Then the reply is an error
    And the reply says "no free editor or reviewer seat"
    And nobody new has a pending invitation
    When I invite "new.coauthor@example.com" to view the project
    Then "new.coauthor@example.com" has a pending invitation to view the project

  Scenario Outline: Anything but one bare address is refused before Overleaf is asked
    When I invite "<email>" to view the project
    Then the reply says "email must be one address"
    And Overleaf was sent no change to who the project is shared with

    Examples:
      | email                            |
      | Ada <ada@example.com>            |
      | ada@example.com, bea@example.com |
      | not an address                   |

  Scenario: An address Overleaf does not accept is reported as such
    When I invite "someone@localhost" to view the project
    Then the reply says "Overleaf did not accept someone@localhost as an email address, so no invitation was sent."

  Scenario: Bot protection that wants a captcha sends me to the Share menu
    Given overleaf.com's bot protection holds back invitations
    When I invite "new.coauthor@example.com" to view the project
    Then the reply is an error
    And the reply says "send the invitation from the project's Share menu"
    And nobody new has a pending invitation

  Scenario: Lowering a member's access asks me nothing
    When I change the access of "ada@example.com" to "view"
    Then the reply says 'from "can edit" to "can view"'
    And my MCP client asked me nothing
    And "ada@example.com" can view the project

  Scenario: Giving a member more access waits until I confirm it
    When I change the access of "bea@example.com" to "edit"
    Then my MCP client asked me 'Change the access of bea@example.com to "Fake paper" from "can review" to "can edit"? Overleaf applies it at once. Confirm only if you asked for this change.'
    And the question had one box to tick, "Change the access"
    And the reply says 'from "can review" to "can edit"'
    And "bea@example.com" can edit the project

  Scenario: More access I decline is not given
    Given I will answer what my MCP client asks me with "decline"
    When I change the access of "bea@example.com" to "edit"
    Then the reply is not an error
    And the reply says 'Giving bea@example.com access "can edit" was not confirmed, so nothing changed.'
    And Overleaf was sent no change to who the project is shared with

  Scenario: An MCP client that cannot ask me still takes access away, and nothing more
    Given my MCP client cannot ask me anything
    When I change the access of "ada@example.com" to "review"
    Then "ada@example.com" can review the project
    When I withdraw the invitation to "invited.coauthor@example.com"
    Then nobody has a pending invitation
    When I change the access of "ada@example.com" to "edit"
    Then the reply is an error
    And the reply says 'Nothing changed; change the access of ada@example.com from the Share menu of "Fake paper" in Overleaf instead.'
    And "ada@example.com" can review the project

  Scenario: Asking for the access a member already has changes nothing
    When I change the access of "bea@example.com" to "review"
    Then the reply says 'access to "Fake paper" is already "can review"; nothing changed.'
    And Overleaf was sent no change to who the project is shared with

  Scenario: Giving a viewer edit access needs a seat on the owner's plan
    Given "ada@example.com" can only view the project
    And the owner's plan has no editor or reviewer seat left
    When I change the access of "ada@example.com" to "edit"
    Then the reply is an error
    And the reply says "kept the old access level"
    And "ada@example.com" can view the project

  Scenario: An invitation not yet accepted has no access level to change
    When I change the access of "invited.coauthor@example.com" to "view"
    Then the reply is an error
    And the reply says "has not accepted the invitation"
    And Overleaf was sent no change to who the project is shared with

  Scenario: A member is removed without asking me
    When I remove "bea@example.com" from the project
    Then the reply says 'Removed Bea Example <bea@example.com>, whose access was "can review", from "Fake paper".'
    And my MCP client asked me nothing
    And "bea@example.com" is no longer a member of the project

  Scenario: A pending invitation is withdrawn
    When I withdraw the invitation to "INVITED.coauthor@example.com"
    Then the reply says 'Withdrew the invitation to invited.coauthor@example.com for "Fake paper"'
    And nobody has a pending invitation

  Scenario: A member is removed, not withdrawn, and an invitation withdrawn, not removed
    When I withdraw the invitation to "ada@example.com"
    Then the reply says "take their access away with remove_member"
    When I remove "invited.coauthor@example.com" from the project
    Then the reply says "withdraw it with revoke_invite"
    And Overleaf was sent no change to who the project is shared with

  Scenario: Someone who is neither a member nor invited is named as such
    When I remove "stranger@example.com" from the project
    Then the reply is an error
    And the reply says 'stranger@example.com is not an invited member of "Fake paper"'

  Scenario Outline: Only the owner changes who a project is shared with
    When I invite "new.coauthor@example.com" to view "<project>"
    Then the reply is an error
    And the reply says 'Only the owner of "<project>" can change who it is shared with, and this account <access> it. Nothing was sent.'
    And my MCP client asked me nothing
    And Overleaf was sent no change to who the project is shared with

    Examples:
      | project        | access   |
      | Shared Thesis  | can edit |
      | Grant Proposal | can view |
