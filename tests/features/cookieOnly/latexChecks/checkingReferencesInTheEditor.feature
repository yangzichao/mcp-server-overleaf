Feature: Without Git integration, check_references reads the paper as Overleaf's editor holds it

  With only a session cookie, check_references starts from the main document set in Overleaf's
  menu and reads every file it includes from the live editor, so a fix made a moment ago is
  checked at once. An uploaded figure counts as present.

  Background:
    Given the server was given "only a session cookie"
    And the project has a paper "paper.tex" whose body in "sections/body.tex" refers to a missing label and shows the uploaded figure
    And Overleaf's menu names "paper.tex" as the main document

  Scenario: The check starts from the main document set in Overleaf's menu
    When I check the references
    Then the check says "Checked paper.tex and 1 file it includes with no bibliography: 1 problem:"
    And the reply says "sec:missing  \ref at sections/body.tex:2"
    But the check does not report "\includegraphics{figure}", which is uploaded

  Scenario: A main document named in the call is checked instead
    When I check the references starting from "main.tex"
    Then the check says "Checked main.tex with no bibliography: no problems found."
    And the reply says "not included from main.tex, were not checked: paper.tex, sections/body.tex"

  Scenario: A fix made in the editor is checked at once, with no push
    When I replace "sec:missing" with "sec:body" in "sections/body.tex"
    And I check the references
    Then the check says "Checked paper.tex and 1 file it includes with no bibliography: no problems found."

  Scenario: A main document that does not exist is refused, naming the ones that do
    When I check the references starting from "nope.tex"
    Then the reply is an error
    And the reply says 'No file at "nope.tex". The .tex files are: main.tex, paper.tex, sections/body.tex.'
