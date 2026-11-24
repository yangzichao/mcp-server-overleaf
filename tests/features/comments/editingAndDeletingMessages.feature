Feature: One message in a comment thread can be corrected or taken back

  manage_comments (action edit_message) rewrites a message and (action delete_message) removes
  one reply, leaving the rest of the thread. Each names the message by the id read_review
  (view comments) shows beside it. Overleaf lets anyone edit only their own messages; with
  review access, only one's own messages can be deleted too. After each change the thread is
  read again, so a change Overleaf did not keep is reported instead of claimed.

  Background:
    Given I am signed in to Overleaf with a paper whose third line reads "Hello world."
    And Ada's thread on "Hello world." holds, in order:
      | author | message                         |
      | Ada    | Should this greeting be formal? |
      | You    | Yes, keep it.                   |
      | Ada    | Fine by me.                     |

  Scenario: Reading the thread shows the id of each message
    When I read the comments on "main.tex"
    Then my reply is shown as "[message message-2] You 2026-11-01T12:02:00.000Z: Yes, keep it."

  Scenario: I can rewrite my own message
    When I edit my reply to read "No, make it formal."
    Then the reply says my reply was edited and reading the thread again shows the new text
    And Ada's thread holds "Should this greeting be formal?", "No, make it formal." and "Fine by me."

  # Bug: edit_message answers "Edited message" when the message already reads the new text.
  @bug
  Scenario: Rewriting a message with the text it already has changes nothing
    When I edit my reply to read "Yes, keep it."
    Then the reply says "nothing changed"
    And Overleaf was never asked to change a message

  Scenario: Someone else's message cannot be rewritten
    When I edit Ada's question to read "Rewritten."
    Then the reply is an error
    And the reply says "Overleaf refused to edit message message-1, which Ada wrote. Overleaf's editor offers editing only on one's own messages; reply in the thread instead."
    And Ada's thread holds "Should this greeting be formal?", "Yes, keep it." and "Fine by me."

  Scenario: Deleting a reply keeps the rest of the thread
    When I delete my reply
    Then the reply says my reply was deleted and the thread's other messages stay
    And Ada's thread holds "Should this greeting be formal?" and "Fine by me."

  Scenario: The message that opens a thread is not deleted on its own
    When I delete Ada's question
    Then the reply is an error
    And the reply says "Use action delete to remove the whole thread, or edit_message to change its text."
    And Overleaf was never asked to delete a message

  Scenario: With review access, I can delete my own reply but not someone else's
    Given my access to the project is "review"
    When I delete my reply
    Then the reply is not an error
    When I delete Ada's follow-up
    Then the reply is an error
    And the reply says "Overleaf refused to delete message message-3, which Ada wrote: with review access, only one's own messages can be deleted."
    And Ada's thread holds "Should this greeting be formal?" and "Fine by me."

  Scenario: A message id that does not exist names the ones that do
    When I edit message "message-9" in Ada's thread to read "Anything."
    Then the reply is an error
    And the reply says "has no message message-9. Its messages: [message message-1] by Ada, [message message-2] by You, [message message-3] by Ada."
    And Overleaf was never asked to change a message

  Scenario Outline: A change Overleaf accepts but does not keep is reported as a failure
    Given Overleaf accepts message changes without keeping them
    When I "<change>" my reply
    Then the reply is an error
    And the reply says "<report>"
    And Ada's thread holds "Should this greeting be formal?", "Yes, keep it." and "Fine by me."

    Examples:
      | change | report                                                                   |
      | edit   | Overleaf accepted the edit, but reading thread                           |
      | delete | Overleaf accepted the deletion, but message message-2 is still in thread |

  Scenario: An edit needs the new text
    When I edit my reply without giving new text
    Then the reply is an error
    And the reply says "edit_message needs message."
