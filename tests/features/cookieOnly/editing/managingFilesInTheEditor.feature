Feature: Without Git integration, manage_files changes Overleaf's file tree directly

  With only a session cookie, manage_files deletes, moves, uploads files and folders, and creates
  folders in Overleaf's file tree at once: co-authors see the change immediately, and there is no
  push step and no undo here. The actions that work on a local clone, restore and discard_local_changes,
  are not offered, since there is no clone.

  Background:
    Given the server was given "only a session cookie"
    And the project has a document "sections/intro.tex" reading "\section{Intro}"

  Scenario: Deleting a document removes it from Overleaf at once
    Given the project has a document "notes.tex" reading "Notes."
    When I delete "notes.tex"
    Then the reply says "Deleted notes.tex from Overleaf. It is in Overleaf now; co-authors see it already."
    And "notes.tex" is not in the project
    And the paper is unchanged

  Scenario: Deleting a folder deletes everything in it and names what went
    Given the project has a document "sections/method.tex" reading "\section{Method}"
    When I delete "sections"
    Then the reply says "Deleted the folder sections and the 2 files in it (sections/intro.tex, sections/method.tex) from Overleaf."
    And "sections/method.tex" is not in the project
    And "sections" is not in the project

  Scenario: Deleting something that is not in the project deletes nothing
    When I delete "absent.tex"
    Then the reply says "absent.tex is not in the project, so there is nothing to delete."
    And "sections/intro.tex" still reads "\section{Intro}"

  Scenario: Deleting the main document says to choose another before compiling
    When I delete "main.tex"
    Then the reply says "It held the project's main document, so choose another before compiling"
    And "main.tex" is not in the project

  Scenario: Moving a document renames it and keeps the document itself
    When I move "sections/intro.tex" to "chapters/introduction.tex"
    Then the reply says "Moved sections/intro.tex to chapters/introduction.tex in Overleaf."
    And the reply says "Any \input, \include or \includegraphics still naming sections/intro.tex now points at nothing"
    And the document that was "sections/intro.tex" is now at "chapters/introduction.tex"
    And "sections/intro.tex" is not in the project

  Scenario: Moving a folder moves everything in it
    When I move "sections" to "parts/sections"
    Then the reply says "Moved the folder sections, with the 1 file in it (sections/intro.tex), to parts/sections in Overleaf."
    And the document that was "sections/intro.tex" is now at "parts/sections/intro.tex"

  Scenario: Moving onto a path that is taken is refused and keeps both
    When I move "main.tex" to "figure.png"
    Then the reply is an error
    And the reply says "figure.png already exists. Nothing was moved."
    And "figure.png" is still the uploaded figure
    And the paper is unchanged

  Scenario: Moving something that is not in the project is refused
    When I move "absent.tex" to "elsewhere.tex"
    Then the reply is an error
    And the reply says "absent.tex is not in the project, so there is nothing to move."
    And "elsewhere.tex" is not in the project

  Scenario: An uploaded text file becomes an editable document
    When I upload "notes/readme.txt" holding the line "Hello"
    Then the reply says "Added notes/readme.txt (6 bytes) in Overleaf, stored as an editable document."
    And Overleaf's copy of "notes/readme.txt" reads:
      | line  |
      | Hello |

  Scenario: A figure on this computer is uploaded byte for byte as a binary file
    Given a figure "plot.png" on this computer
    When I upload it to "figures/plot.png"
    Then the reply says "Added figures/plot.png (77 bytes) in Overleaf, stored as a binary file."
    And Overleaf holds "figures/plot.png" byte for byte as the figure on this computer

  Scenario: Uploading over an uploaded figure replaces it
    Given a figure "plot.png" on this computer
    When I upload it to "figure.png"
    Then the reply says "Replaced figure.png (77 bytes) in Overleaf, stored as a binary file."
    And Overleaf holds "figure.png" byte for byte as the figure on this computer

  Scenario: Uploading onto a folder is refused
    Given a figure "plot.png" on this computer
    When I upload it to "sections"
    Then the reply is an error
    And the reply says "sections is a folder in Overleaf, so a file cannot be uploaded there. Nothing was changed."
    And "sections/intro.tex" still reads "\section{Intro}"

  Scenario: Creating a folder creates its missing parent folders too
    When I create the folder "figures/plots"
    Then the reply says "Created the folder figures/plots in Overleaf, with its missing parent folder figures."
    And "figures/plots" is a folder in the project

  Scenario: Creating a folder that already exists creates nothing
    When I create the folder "sections"
    Then the reply says "sections is already a folder in Overleaf, so nothing was created."
    And "sections/intro.tex" still reads "\section{Intro}"

  Scenario Outline: Only an account that may edit can change the file tree
    Given my access to the project is "<access>"
    When I use manage_files's action "<action>" on the uploaded figure
    Then the file tree is "<outcome>"

    Examples:
      | action        | access       | outcome             |
      | delete        | readAndWrite | changed             |
      | move          | readAndWrite | changed             |
      | upload        | readAndWrite | changed             |
      | create_folder | readAndWrite | changed             |
      | delete        | review       | refused: can review |
      | move          | review       | refused: can review |
      | upload        | review       | refused: can review |
      | create_folder | review       | refused: can review |
      | delete        | readOnly     | refused: can view   |
      | move          | readOnly     | refused: can view   |
      | upload        | readOnly     | refused: can view   |
      | create_folder | readOnly     | refused: can view   |

  Scenario Outline: The actions that work on a local clone are not offered
    When I use manage_files's action "<action>" on "main.tex"
    Then the reply is an error
    And the reply says 'expected one of "delete"|"move"|"upload"|"upload_folder"|"create_folder"'
    And the paper is unchanged

    Examples:
      | action                |
      | restore               |
      | discard_local_changes |
