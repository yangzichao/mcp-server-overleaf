Feature: Searching finds where something is written across the whole paper

  The assistant often does not know which file mentions a term, a citation key or a
  command. A search covers every text source of the project at once and answers with file
  and line.

  Background:
    Given the co-author has published a paper whose method lives in "sections/method.tex"

  Scenario: A literal search finds every matching line in every file
    When I search for "sample"
    Then the matches are:
      | match                                          |
      | main.tex:4: The sample size is 5000.           |
      | sections/method.tex:2: We sampled 5000 people. |

  Scenario: A search ignores letter case
    When I search for "SAMPLE SIZE"
    Then the matches are:
      | match                                |
      | main.tex:4: The sample size is 5000. |

  Scenario: LaTeX commands are found as written, with no escaping
    When I search for "\input{sections/method}"
    Then the matches are:
      | match                               |
      | main.tex:5: \input{sections/method} |

  Scenario: A regular expression search matches a pattern
    When I search for the regular expression "\d{4} people"
    Then the matches are:
      | match                                          |
      | sections/method.tex:2: We sampled 5000 people. |

  Scenario: A search with no matches says so
    When I search for "regression"
    Then the reply says there are no matches for "regression"

  Scenario: A file created here is not searched until it is pushed
    When I create "draft.tex" saying "an unpublished idea"
    And I search for "unpublished idea"
    Then the reply says there are no matches for "unpublished idea"

  Scenario: An invalid regular expression is reported, not run
    When I search for the regular expression "(unclosed"
    Then the search fails with "Invalid regular expression"
