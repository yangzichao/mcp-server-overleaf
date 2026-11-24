Feature: A DOI, an arXiv id or a few words become a BibTeX entry to cite

  look_up_citations (action find) looks each query up where it belongs: a DOI in doi.org, an
  arXiv id in arXiv, and plain words in Crossref. It answers with BibTeX under a key no .bib
  file in the project uses yet. Only the queries are sent, nothing from the project. Here the
  three services are local fakes that know a fixed set of works; nothing reaches the network.

  Background:
    Given the paper cites "he2016deep" from "refs.bib", whose DOI is 10.1109/CVPR.2016.90
    And the catalogues know that DOI, the arXiv paper 1706.03762 and a Crossref work by Goodfellow

  Scenario Outline: Each kind of query is looked up where it belongs
    When I look up "<query>"
    Then the query is read as a "<kind>" and "<outcome>"
    And the reply offers an entry starting "<entry>"

    Examples:
      | query                                  | kind     | outcome                         | entry                                     |
      | 10.1109/cvpr.2016.90                   | DOI      | found in doi.org                | @inproceedings{he2016deepb,               |
      | arXiv:1706.03762                       | arXiv id | found in arXiv                  | @misc{vaswani2017attention,               |
      | generative adversarial nets goodfellow | words    | 1 match in Crossref, best first | @inproceedings{goodfellow2014generative,  |

  Scenario: Several queries are answered in one call, with a summary first
    When I look up "10.1109/cvpr.2016.90", "arXiv:1706.03762" and "generative adversarial nets goodfellow"
    Then the reply starts with "Looked up 3 queries: 2 found, 1 with matches to choose from, 0 without an entry. Keys avoid those already in refs.bib."
    And the reply says "Nothing was written to the project; add the entries you choose to a .bib file with edit_file."
    And nothing is pending in the project

  Scenario: A work already in the bibliography points at the key it has
    When I look up "10.1109/cvpr.2016.90"
    Then the reply says "This work is already in the bibliography as he2016deep; cite that key rather than adding the entry again."

  Scenario: Only the queries leave this computer
    When I look up "10.1109/cvpr.2016.90", "arXiv:1706.03762" and "generative adversarial nets goodfellow"
    Then exactly one lookup went to each of doi.org, arXiv and Crossref
    And Crossref was asked for "generative adversarial nets goodfellow" and nothing else

  Scenario: Finding needs something to look up
    When I ask to find citations without any query
    Then the reply is an error that says "find needs queries."
    And no lookup was made
