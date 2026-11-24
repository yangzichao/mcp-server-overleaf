Feature: Without Git integration, read_project describes the project as Overleaf's editor holds it

  With only a session cookie, read_project's overview and outline read the live editor. The main
  document is the one set in Overleaf's menu, and a co-author's pending suggestion reads as if
  it had been accepted. The views that describe a local clone, status and changes, are not
  offered, since there is no clone.

  Background:
    Given the server was given "only a session cookie"

  Scenario: The overview names the project, its main document, its files, its settings and my access
    When I read the project's overview
    Then the overview reads:
      | line                                                                      |
      | Project: "Fake paper"                                                     |
      | Main document: main.tex                                                   |
      | Files: 1 editable document and 1 binary upload, such as figures.          |
      | Compiler: pdflatex. TeX Live image: texlive-full:2025.1. Spell check: en. |
      | Track changes: off.                                                       |
      | This account's access: owner.                                             |

  Scenario Outline: The overview says what this account may do, in the words of Overleaf's share dialog
    Given my access to the project is "<access>"
    When I read the project's overview
    Then the reply says "This account's access: <shown>."

    Examples:
      | access       | shown      |
      | owner        | owner      |
      | readAndWrite | can edit   |
      | review       | can review |
      | readOnly     | can view   |

  Scenario: The outline starts from the main document set in Overleaf's menu and follows what it includes
    Given the project has a paper "paper.tex" that includes its method from "sections/method.tex"
    And Overleaf's menu names "paper.tex" as the main document
    When I read the outline
    Then the reply says "Outline of paper.tex, the main document set in Overleaf's menu:"
    And the outline lists, in reading order:
      | heading                | file                | lines |
      | \section{Introduction} | paper.tex           | 3-4   |
      | \section{Method}       | sections/method.tex | 1-4   |
      | \subsection{Data}      | sections/method.tex | 3-4   |
      | \section{Conclusion}   | paper.tex           | 5-6   |

  Scenario: The outline of one file alone leaves out the files it includes
    Given the project has a paper "paper.tex" that includes its method from "sections/method.tex"
    When I read the outline of "paper.tex" alone
    Then the outline lists:
      | heading                | lines |
      | \section{Introduction} | 3-4   |
      | \section{Conclusion}   | 5-6   |

  Scenario: A heading a co-author has suggested shows in the outline as if accepted
    Given a collaborator has suggested the heading "\section{Results}" on its own line above "Hello world."
    When I read the outline of "main.tex" alone
    Then the outline lists:
      | heading           | lines |
      | \section{Results} | 3-4   |

  Scenario: An outline of a file that does not exist names the .tex files there are
    When I read the outline of "nope.tex" alone
    Then the reply is an error
    And the reply says 'No file at "nope.tex". The .tex files are: main.tex.'

  Scenario Outline: The views that describe a local clone are not offered
    When I read the project's "<view>" view
    Then the reply is an error
    And the reply says 'expected one of "overview"|"files"|"outline"|"members"|"word_count"'

    Examples:
      | view    |
      | status  |
      | changes |
