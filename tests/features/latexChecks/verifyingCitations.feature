Feature: Every cited entry is checked against a real catalogue

  look_up_citations (action verify) looks each bibliography entry up in doi.org, Crossref and
  arXiv, so an identifier pointing at the wrong paper, or a title nobody published, is caught
  before submission. In these scenarios the three services are local fakes that know a fixed set
  of works; nothing reaches the real network.

  Background:
    Given the paper cites six entries from "refs.bib" and one key with no entry
    And the catalogues know some of those works

  Scenario: A DOI that belongs to a different work is flagged
    When I verify the citations
    Then the verdict is "Looked up 6 entries from refs.bib: 2 entries point at a missing or different work."
    And "wrongdoi" is flagged because its DOI belongs to "Protein structure prediction"

  Scenario: A DOI that does not resolve is flagged
    When I verify the citations
    Then "fakedoi" is flagged because doi.org has no such DOI

  Scenario: A title no catalogue knows is reported with the closest match
    When I verify the citations
    Then "madeup" is reported as not found in Crossref, closest match "Quantum gravity explained"

  Scenario: Entries confirmed by DOI, arXiv id or title search are listed as confirmed
    When I verify the citations
    Then the confirmed entries are "real2017 (DOI), preprint (arXiv id), searched (found in Crossref as DOI 10.5555/gan)"

  Scenario: A cited key with no bibliography entry is named
    When I verify the citations
    Then the reply names "missingkey" as having no entry in any bibliography file

  Scenario: An entry nobody cites is not looked up unless asked for by key
    When I verify the citations
    Then no lookup was made for the DOI of "uncited"
    When I verify only the citations "uncited"
    Then the confirmed entries are "uncited (DOI)"

  Scenario: Lookups stop at the requested number of entries
    When I verify at most 1 citation
    Then the confirmed entries are "real2017 (DOI)"
    And the reply says "5 more entries were not looked up"

  Scenario: Every lookup names the server and carries no email address
    When I verify the citations
    Then every lookup's user agent names mcp-server-overleaf and contains no "@"
