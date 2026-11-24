Feature: Without Git integration, look_up_citations checks the bibliography as Overleaf's editor holds it

  With only a session cookie, look_up_citations (action verify) reads the cited entries from the
  live editor, starting from the main document set in Overleaf's menu, and looks each one up in
  doi.org, Crossref and arXiv. In these scenarios the three services are local fakes that know a
  fixed set of works; nothing reaches the real network.

  Background:
    Given the server was given only a session cookie, and the catalogues know some works
    And the project's "paper.tex" cites six entries from "refs.bib" and one key with no entry
    And Overleaf's menu names "paper.tex" as the main document

  Scenario: The entries cited from the main document set in Overleaf's menu are looked up
    When I verify the citations
    Then the verdict is "Looked up 6 entries from refs.bib: 2 entries point at a missing or different work."
    And the confirmed entries are "real2017 (DOI), preprint (arXiv id), searched (found in Crossref as DOI 10.5555/gan)"
    And the reply says "No entry in any bibliography file for: missingkey."

  Scenario: A wrong or unresolvable DOI is flagged with the file and line to fix
    When I verify the citations
    Then the reply says 'wrongdoi (refs.bib:2): DOI 10.5555/other belongs to "Protein structure prediction"'
    And the reply says "fakedoi (refs.bib:3): DOI 10.5555/missing does not resolve; doi.org has no such DOI."

  Scenario: A DOI corrected in the editor is confirmed at once, with no push
    Given the catalogues also know "Deep residual learning for image recognition" as DOI "10.5555/resnet"
    When I replace "10.5555/other" with "10.5555/resnet" in "refs.bib"
    And I verify the citations
    Then the verdict is "Looked up 6 entries from refs.bib: 1 entry points at a missing or different work."
    And the confirmed entries are "real2017 (DOI), wrongdoi (DOI), preprint (arXiv id), searched (found in Crossref as DOI 10.5555/gan)"

  Scenario: A main document named in the call is read instead, and looks nothing up when it cites nothing
    When I verify the citations starting from "main.tex"
    Then the reply says "main.tex cites no entry in any bibliography file."
    And no catalogue was asked anything

  Scenario: Only the keys asked for are looked up, cited or not
    When I verify only the citations "uncited"
    Then the confirmed entries are "uncited (DOI)"
