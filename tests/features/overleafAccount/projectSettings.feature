Feature: The project's compiler, main document, spell check, TeX Live version and track changes can be changed

  manage_project (action update_settings) changes what the Settings menu of Overleaf's editor
  changes. Every value is checked before anything is sent, and a fresh connection to the
  project then confirms each change, so a change Overleaf did not keep is reported instead of
  claimed.

  Background:
    Given I am signed in to Overleaf

  Scenario: Several settings change at once, and each is confirmed
    Given the project has a document "thesis.tex" reading "The thesis."
    When I change the project's settings to:
      | setting          | value               |
      | compiler         | xelatex             |
      | TeX Live version | texlive-full:2024.1 |
      | main document    | thesis.tex          |
      | spell check      | off                 |
    Then the reply says 'Changed the settings of "Fake paper": compiler xelatex, TeX Live image texlive-full:2024.1, main document thesis.tex, spell check off. A fresh connection to the project confirms each change.'
    And Overleaf compiles "thesis.tex" with "xelatex" on "texlive-full:2024.1", without spell checking

  Scenario: Track changes is switched for everyone at once, guests included
    When I turn track changes "on" for everyone
    Then the reply says "track changes on for everyone. A fresh connection to the project confirms each change."
    And track changes is on for me, each collaborator and guests
    When I turn track changes "off" for everyone
    Then the reply says "track changes off for everyone."

  Scenario: A change Overleaf accepted but did not keep is reported as a failure
    Given Overleaf accepts the track changes switch without keeping it
    When I change the project's settings to:
      | setting       | value    |
      | compiler      | lualatex |
      | track changes | on       |
    Then the reply is an error
    And the reply says "a fresh connection to the project does not show all of it."
    And the reply says "In effect now: compiler lualatex."
    And the reply says "Not in effect: track changes on for everyone (the project reports off)."

  Scenario Outline: A value Overleaf would not take is refused before anything is sent
    Given the project has a document "refs.bib" reading "@article{a, title={A}}"
    When I change the project's "<setting>" to "<value>"
    Then the reply is an error
    And the reply says "<refusal>"
    And no settings change was sent to Overleaf

    Examples:
      | setting          | value               | refusal                                                                     |
      | TeX Live version | texlive-full:2017.1 | is not a TeX Live version this account can use.                             |
      | spell check      | fr                  | is not a spell-check language Overleaf offers. It offers: en, en_GB, de.    |
      | main document    | missing.tex         | in this project. Editable documents: main.tex, refs.bib.                    |
      | main document    | refs.bib            | refs.bib cannot be the main document: Overleaf accepts .tex, .Rtex, .ltx and .Rnw files. |

  Scenario: An account that may only review cannot change the settings
    Given my access to the project is "review"
    When I change the project's "compiler" to "xelatex"
    Then the reply is an error
    And the reply says 'This account can review "Fake paper", and changing its settings needs edit access.'
    And no settings change was sent to Overleaf

  Scenario: Without track changes in the owner's plan, nothing else changes either
    Given the owner's Overleaf plan does not include track changes
    When I change the project's settings to:
      | setting       | value   |
      | compiler      | xelatex |
      | track changes | on      |
    Then the reply is an error
    And the reply says "Track changes is not part of the project owner's Overleaf plan"
    And Overleaf still compiles with "pdflatex"
    And no settings change was sent to Overleaf

  # Bug: update_settings answers "Changed the settings" and sends the change when the value is already in effect.
  @bug
  Scenario: A setting that is already in effect changes nothing
    When I change the project's "compiler" to "pdflatex"
    Then the reply says "nothing changed"
    And no settings change was sent to Overleaf

  Scenario: At least one setting is needed
    When I ask to change the project's settings without naming any
    Then the reply is an error
    And the reply says "update_settings needs at least one of compiler, rootDocument, spellCheckLanguage, texLiveImage or trackChanges."
