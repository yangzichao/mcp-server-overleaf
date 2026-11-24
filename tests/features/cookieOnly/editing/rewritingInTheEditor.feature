Feature: Without Git integration, edit_file rewrites sections and whole files in Overleaf directly

  With only a session cookie, edit_file's replace_section, write and append change the document
  in Overleaf at once: co-authors see the change immediately, and there is no push_changes step
  and no undo here. Only the text that changes is sent, so a comment a co-author anchored
  elsewhere in the document stays on its text.

  Background:
    Given the server was given "only a session cookie"
    And the project has a chapter "chapter.tex" with an Intro and a Method section
    And a co-author has commented on "Method text." in the chapter

  Scenario: A section is replaced in Overleaf at once, as ordinary text
    When I replace the section "intro" of "chapter.tex" with:
      | line                |
      | \section{Intro}     |
      | A new introduction. |
    Then the reply says "Replaced \section{Intro} (lines 1-2) in chapter.tex. It is in Overleaf now"
    And Overleaf's copy of "chapter.tex" reads:
      | line                |
      | \section{Intro}     |
      | A new introduction. |
      | \section{Method}    |
      | Method text.        |
    And the co-author's comment still marks "Method text."
    And the chapter holds no suggestions

  Scenario: A section that already reads like the new content changes nothing
    When I replace the section "Intro" of "chapter.tex" with:
      | line            |
      | \section{Intro} |
      | Old intro.      |
    Then the reply says "\section{Intro} (lines 1-2) in chapter.tex already reads exactly like content. Nothing was changed."
    And the chapter is unchanged

  Scenario: A section title that matches nothing is refused, listing the titles there are
    When I replace the section "Results" of "chapter.tex" with:
      | line              |
      | \section{Results} |
    Then the reply is an error
    And the reply says 'No section matching "Results" in chapter.tex. Available: Intro, Method'
    And the chapter is unchanged

  Scenario: Writing a whole document sends only the passages that differ
    When I write "chapter.tex" as:
      | line                   |
      | \section{Introduction} |
      | Old intro.             |
      | \section{Method}       |
      | Method text.           |
    Then the reply says "Overwrote chapter.tex in Overleaf, sending only the passages that differ"
    And Overleaf's copy of "chapter.tex" reads:
      | line                   |
      | \section{Introduction} |
      | Old intro.             |
      | \section{Method}       |
      | Method text.           |
    And the co-author's comment still marks "Method text."

  Scenario: Writing what a document already holds changes nothing
    When I write "chapter.tex" with the text it already holds
    Then the reply says "chapter.tex already holds exactly this content. Nothing was changed."
    And the chapter is unchanged

  Scenario: Writing a document that does not exist creates it, with its missing folders
    When I write "chapters/one/intro.tex" as:
      | line           |
      | \section{One}  |
      | First chapter. |
    Then the reply says "Created chapters/one/intro.tex in Overleaf, along with the missing folders chapters, chapters/one."
    And Overleaf's copy of "chapters/one/intro.tex" reads:
      | line           |
      | \section{One}  |
      | First chapter. |

  Scenario: Text is not written over an uploaded figure
    When I write "figure.png" as:
      | line         |
      | Not a figure |
    Then the reply is an error
    And the reply says "Replace an upload with manage_files (action upload)."
    And "figure.png" is still the uploaded figure

  Scenario: Appending adds the text on a new line at the end
    When I append "% A closing note." to "main.tex"
    Then the reply says "Appended 1 line to the end of main.tex. It is in Overleaf now"
    And Overleaf's copy of "main.tex" reads:
      | line                    |
      | \documentclass{article} |
      | \begin{document}        |
      | Hello world.            |
      | \end{document}          |
      | % A closing note.       |

  Scenario: Appending to a document that does not exist is refused, pointing at write
    When I append "% A note." to "absent.tex"
    Then the reply is an error
    And the reply says "absent.tex does not exist, so there is nothing to append to. Nothing was written; use action write to create it."
    And "absent.tex" is not in the project

  Scenario Outline: Only an account that may edit can rewrite a document
    Given my access to the project is "<access>"
    When I use edit_file's action "<action>" on the chapter
    Then the chapter is "<outcome>"

    Examples:
      | action          | access       | outcome                                     |
      | replace_section | readAndWrite | changed                                     |
      | write           | readAndWrite | changed                                     |
      | append          | readAndWrite | changed                                     |
      | replace_section | review       | refused, pointing to manage_tracked_changes |
      | write           | review       | refused, pointing to manage_tracked_changes |
      | append          | review       | refused, pointing to manage_tracked_changes |
      | replace_section | readOnly     | refused as read-only                        |
      | write           | readOnly     | refused as read-only                        |
      | append          | readOnly     | refused as read-only                        |

  Scenario: A reviewer cannot create a document either
    Given my access to the project is "review"
    When I write "notes.tex" as:
      | line   |
      | Notes. |
    Then the reply is an error
    And the reply says "Use manage_tracked_changes (action suggest) instead."
    And "notes.tex" is not in the project

  Scenario: A reviewer hears about a wrong section title the same way an editor does
    Given my access to the project is "review"
    When I replace the section "Results" of "chapter.tex" with:
      | line              |
      | \section{Results} |
    Then the reply is an error
    And the reply says 'No section matching "Results" in chapter.tex. Available: Intro, Method'
