Feature: The paper's words are counted the way Overleaf's Word Count menu counts them

  On a server with only a Git token, read_project (view word_count) runs texcount in the local
  clone with the flags Overleaf's menu uses, so an edit not pushed yet is already counted. In
  these scenarios texcount is a stand-in that counts the words on every line that does not
  start with a command.

  Background:
    Given texcount is installed
    And the main document has three words of text and includes "sections/method.tex", which has two

  Scenario: The likely main document is counted together with what it includes
    When I count the words
    Then the reply starts with "texcount's word count for main.tex, the likely main document, in the local clone (unpushed edits included):"
    And the count says "Words in text: 5"
    And the words in text are counted per file as:
      | file                | words |
      | main.tex            | 3     |
      | sections/method.tex | 2     |

  Scenario: An edit not pushed yet is counted
    When I replace "Two more." with "Now four words here." in "sections/method.tex"
    And I count the words in "sections/method.tex"
    Then the reply starts with "texcount's word count for sections/method.tex, in the local clone (unpushed edits included):"
    And the count says "Words in text: 4"

  Scenario: A file that does not exist is refused, naming the .tex files that do
    When I count the words in "missing.tex"
    Then the reply is an error that says 'No file at "missing.tex". The .tex files are: main.tex, sections/method.tex.'

  Scenario: Only a .tex file can be counted
    When I count the words in "refs.bib"
    Then the reply is an error that says "word_count counts a .tex file, and refs.bib is not one."
