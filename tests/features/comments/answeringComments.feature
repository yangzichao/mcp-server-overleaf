Feature: Replying to, resolving and deleting a comment thread

  These change the discussion for every collaborator at once. Each names the thread by the id
  read_review (view comments) shows, and an id that matches no thread changes nothing.

  Background:
    Given I am signed in to Overleaf with a paper whose third line reads "Hello world."
    And Ada has asked "Should this greeting be formal?" about "Hello world."

  Scenario: A reply is added after the earlier messages
    When I reply "Yes, changed it." in Ada's thread
    Then the reply confirms the message went into Ada's thread
    And Ada's thread holds "Should this greeting be formal?" then "Yes, changed it."

  Scenario: Replying to a thread that does not exist creates nothing
    When I reply "Hello?" in a thread that does not exist
    Then the reply says there is no such comment thread in this project
    And Ada's thread is the only thread in the project

  Scenario: A thread id of the wrong shape is refused before anything is sent
    When I reply "Hello?" in the thread "not-a-thread"
    Then the reply says "A thread id is 24 hexadecimal characters."
    And Ada's thread holds only "Should this greeting be formal?"

  Scenario: An argument the action does not take is refused before anything is sent
    When I reply "Yes, changed it." in Ada's thread and also pass the quoteText "Hello world."
    Then the reply says "quoteText does not apply to reply; add uses it."
    And Ada's thread holds only "Should this greeting be formal?"

  Scenario: Resolving a thread keeps its messages
    When I resolve Ada's thread
    Then the reply says Ada's thread on "Hello world." in "main.tex" was resolved
    And Ada's thread is resolved
    And Ada's thread holds only "Should this greeting be formal?"

  Scenario: A resolved thread can be reopened
    Given Ada's thread has been resolved
    When I reopen Ada's thread
    Then the reply says Ada's thread was reopened
    And Ada's thread is open

  Scenario: A thread in another document is found without naming the document
    Given the project has a document "sections/intro.tex" reading "We begin here."
    And Ada has asked "Is this opening too abrupt?" about "We begin here." in "sections/intro.tex"
    When I resolve Ada's thread in "sections/intro.tex" without naming the document
    Then the reply says that thread on "We begin here." in "sections/intro.tex" was resolved

  Scenario: Deleting a thread removes its anchor and every message
    When I delete Ada's thread
    Then the reply says Ada's thread was deleted with all its messages
    And Overleaf holds no comment threads
    And the paper is unchanged

  Scenario: Resolving a thread that is not anchored anywhere points to read_review
    When I resolve a thread that does not exist
    Then the reply says the thread is not anchored in any document and names read_review
    And Ada's thread is open

  Scenario: Deleting a thread that is not anchored anywhere deletes nothing
    When I delete a thread that does not exist
    Then the reply says the thread is not anchored in any document and names read_review
    And Ada's thread is the only thread in the project

  Scenario: A change still goes through after Overleaf issues a new CSRF token
    Given Ada's thread has been resolved
    And Overleaf has issued a new CSRF token since
    When I reopen Ada's thread
    Then Ada's thread is open

  Scenario Outline: An expired session asks for a fresh cookie instead of failing obscurely
    Given Overleaf no longer recognises the session cookie
    When I "<action>" Ada's thread
    Then the reply asks for a fresh overleaf_session2 cookie

    Examples:
      | action      |
      | list        |
      | reply to    |
      | resolve     |
      | delete      |
