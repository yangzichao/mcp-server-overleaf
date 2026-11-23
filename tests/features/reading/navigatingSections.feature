Feature: A paper can be navigated by its section titles

  Section titles stay put while line numbers shift with every edit, so the assistant
  addresses a paper by its headings. A paper split across files is outlined as one document
  unless one file alone is asked for.

  Background:
    Given the co-author has published a paper whose method lives in "sections/method.tex"

  Scenario: The outline of one file alone lists its headings with their line ranges
    When I list the sections of "main.tex" alone
    Then the outline lists:
      | heading                | lines |
      | \section{Introduction} | 3-6   |
      | \section{Conclusion}   | 7-8   |

  Scenario: The outline of the whole paper follows the files it includes
    When I list the sections of "main.tex"
    Then the outline lists, in reading order:
      | heading                | file                | lines |
      | \section{Introduction} | main.tex            | 3-6   |
      | \section{Method}       | sections/method.tex | 1-4   |
      | \subsection{Data}      | sections/method.tex | 3-4   |
      | \section{Conclusion}   | main.tex            | 7-8   |
    And the outline reports "\input{sections/missing}" on line 6 of "main.tex" as not found

  Scenario: Reading one section leaves the rest of the paper out
    When I read the section "Introduction" of "main.tex"
    Then the reply contains "The sample size is 5000."
    But the reply does not contain "Conclusion"

  Scenario: A partial title picks the first section that contains it
    When I read the section "conc" of "main.tex"
    Then the reply contains "Placeholder."
    But the reply does not contain "Introduction"

  Scenario: Asking for a section that does not exist lists the ones that do
    When I read the section "Results" of "main.tex"
    Then the reply says no section matches "Results" and lists "Introduction, Conclusion"
