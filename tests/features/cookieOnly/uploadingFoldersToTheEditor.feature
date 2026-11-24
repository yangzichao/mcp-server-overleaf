Feature: Without Git integration, a folder from this computer goes into Overleaf at once

  With only a session cookie, manage_files (action upload_folder) sends every file under a
  folder on this computer through Overleaf's upload route, one after another, and Overleaf
  creates the subfolders on the way. Each file is in Overleaf as soon as it is sent, with no
  push_changes step and no undo here. Overleaf decides how to store each one: a text file such
  as a .tex becomes an editable document, anything else a binary file.

  Background:
    Given the server was given "only a session cookie"
    And this computer has a folder "chapter" holding "intro.tex", "figures/plot.png" and a hidden ".git" folder

  Scenario: The folder's files are in Overleaf at once, text as editable documents
    When I upload the folder "chapter" into "parts/chapter"
    Then the reply says "into parts/chapter in Overleaf. Overleaf stored 1 as editable documents and 1 as binary files."
    And the reply says "Left out 1 entry: .git (hidden)."
    And Overleaf holds the document "parts/chapter/intro.tex" reading "\section{Introduction}"
    And Overleaf holds the plot byte for byte at "parts/chapter/figures/plot.png"
    And Overleaf holds nothing at "parts/chapter/.git"

  Scenario: A document already in Overleaf takes the new text
    Given the project has a document "parts/chapter/intro.tex" reading "An older introduction."
    When I upload the folder "chapter" into "parts/chapter"
    Then the reply says "1 of them replacing files already there"
    And Overleaf holds the document "parts/chapter/intro.tex" reading "\section{Introduction}"

  Scenario: A document where a folder would go stops the upload before anything is sent
    When I upload the folder "chapter" into "main.tex"
    Then the reply says "main.tex is an editable document in Overleaf, not a folder, so nothing can go inside it. Nothing was changed."
    And the reply is an error
    And Overleaf was sent no upload

  Scenario: A project that fills up halfway keeps what was sent, and the reply lists it
    Given Overleaf takes one more upload before the project holds too many files
    When I upload the folder "chapter" into "parts/chapter"
    Then the reply says "Uploaded 1 file (13 bytes), then parts/chapter/intro.tex was not uploaded"
    And the reply says "project_has_too_many_files"
    And the reply says "- parts/chapter/figures/plot.png (added, 13 bytes)"
    And the reply says "manage_files (action delete) takes them out again."
    And the reply is an error
    And Overleaf holds the plot byte for byte at "parts/chapter/figures/plot.png"

  Scenario Outline: Only an account that may edit can upload a folder
    Given my access to the project is "<access>"
    When I upload the folder "chapter" into "parts/chapter"
    Then the folder upload is "<outcome>"

    Examples:
      | access       | outcome |
      | owner        | made    |
      | readAndWrite | made    |
      | review       | refused |
      | readOnly     | refused |
