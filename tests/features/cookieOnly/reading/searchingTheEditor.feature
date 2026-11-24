Feature: Without Git integration, search_project searches the documents as Overleaf's editor holds them

  With only a session cookie, search_project reads every editable document from the live
  editor. What a co-author typed a moment ago, and what edit_file just wrote, is found at once,
  with no push in between, and a pending suggestion is searched as if it had been accepted.

  Background:
    Given the server was given "only a session cookie"
    And the project has a document "sections/intro.tex" reading "Hello again."

  Scenario: A search covers every editable document and ignores letter case
    When I search for "HELLO"
    Then the matches are:
      | match                              |
      | main.tex:3: Hello world.           |
      | sections/intro.tex:1: Hello again. |

  Scenario: A regular expression search matches a pattern
    When I search for the regular expression "again\.$"
    Then the matches are:
      | match                              |
      | sections/intro.tex:1: Hello again. |

  Scenario: A co-author's pending suggestion is searched as if accepted
    Given a collaborator has suggested inserting "big " before "world"
    When I search for "big world"
    Then the matches are:
      | match                        |
      | main.tex:3: Hello big world. |

  Scenario: A document written a moment ago is found at once, with no push
    When I write "draft.tex" saying "an unpublished idea"
    And I search for "unpublished idea"
    Then the matches are:
      | match                            |
      | draft.tex:1: an unpublished idea |

  Scenario: A search with no matches says so
    When I search for "regression"
    Then the reply says 'No matches for "regression".'
    And the reply is not an error

  Scenario: An invalid regular expression is reported, not run
    When I search for the regular expression "(unclosed"
    Then the reply is an error
    And the reply says "Invalid regular expression"

  Scenario: An account that may only view the project can still search it
    Given my access to the project is "readOnly"
    When I search for "hello again"
    Then the matches are:
      | match                              |
      | sections/intro.tex:1: Hello again. |
