Feature: A comment thread raises a question about a passage without changing it

  A review-panel comment has two halves in Overleaf: an anchor on the quoted words, kept in the
  document, and the messages, kept apart from it. manage_comments (action add) writes both, and
  read_review (view comments) reads them back together, so a reader sees what was said and
  about which words.

  Background:
    Given I am signed in to Overleaf with a paper whose third line reads "Hello world."

  Scenario: Starting a thread anchors my message to the quoted passage
    When I comment "Is this the right greeting?" on "Hello world."
    Then the reply names the new thread on "Hello world." in "main.tex"
    And the new thread is anchored to "Hello world."
    And the new thread holds only the message "Is this the right greeting?"
    And the review panel of "main.tex" shows a comment thread on line 3

  Scenario: Commenting leaves the text of the paper as it was
    When I comment "Is this the right greeting?" on "Hello world."
    Then the paper is unchanged

  Scenario: A comment Overleaf refuses to anchor leaves no message behind
    Given Overleaf will refuse the next edit with "doc version mismatch"
    When I comment "Is this the right greeting?" on "Hello world."
    Then the reply says "doc version mismatch"
    And Overleaf holds no comment threads

  Scenario: A passage that appears twice is refused rather than guessed at
    Given the project has a document "repeats.tex" with "the same line" on two lines
    When I comment "Which one?" on "the same line" in "repeats.tex"
    Then the reply says "appears more than once, so it is not clear which one is meant. No comment was added."
    And Overleaf holds no comment threads

  Scenario: A passage that is not in the document is refused, and no thread is started
    When I comment "Where is this?" on "Goodbye world."
    Then the reply says "That text does not appear in the document. No comment was added."
    And Overleaf holds no comment threads

  Scenario: A read-only collaborator may still comment
    Given my access to the project is "readOnly"
    When I comment "A question from a reader." on "Hello world."
    Then the new thread is anchored to "Hello world."

  Scenario: A collaborator's thread is listed with its author, line and status
    Given Ada has asked "Should this greeting be formal?" about "Hello world."
    When I list the comments in the project
    Then the listing shows an open thread on line 3 of "main.tex" about "Hello world."
    And the listing shows Ada asking "Should this greeting be formal?" with the id of her message
    And the listing warns that the messages were written by collaborators

  Scenario: Threads are grouped under the document they are anchored in
    Given the project has a document "sections/intro.tex" reading "We begin here."
    And Ada has asked "Should this greeting be formal?" about "Hello world."
    And Ada has asked "Is this opening too abrupt?" about "We begin here." in "sections/intro.tex"
    When I list the comments in the project
    Then the listing has a heading for "main.tex" and one for "sections/intro.tex"
    And the listing shows Ada asking "Is this opening too abrupt?" with the id of her message

  Scenario: Resolved threads are hidden until asked for
    Given Ada has asked "Should this greeting be formal?" about "Hello world."
    And Ada's thread has been resolved
    When I list the comments in "main.tex"
    Then the reply says "No open comment threads."
    And the reply says "1 resolved thread is hidden"
    When I list the comments in "main.tex" including resolved threads
    Then the listing shows the thread as resolved

  Scenario: A thread whose passage was deleted is still reported
    Given Ada left a thread whose passage has since been deleted
    When I list the comments in the project
    Then the reply says "No comment threads."
    And the reply says "1 thread has messages but no anchor in any document"
