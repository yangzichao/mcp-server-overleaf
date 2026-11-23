Feature: Without Git integration, files are read from Overleaf's editor as it stands

  Overleaf's Git bridge is a paid feature; the editor is not. With only a session cookie,
  read_project (view files) and read_file read the live editor instead of a local clone, so
  they see what co-authors typed a moment ago.

  Background:
    Given the server was given "only a session cookie"
    And the project has a document "sections/intro.tex" reading "We begin here."

  Scenario: The listing shows every file, the main document, and which files are uploads
    When I list the project's files
    Then the reply says "3 files"
    And the reply says "Main document: main.tex"
    And the listing includes "sections/intro.tex"
    And the listing includes "figure.png" as a binary upload

  Scenario: The listing can be narrowed to one extension
    When I list the project's files with the extension "png"
    Then the listing includes "figure.png" as a binary upload
    But the listing does not include "main.tex"

  Scenario: A document is read whole
    When I read "main.tex"
    Then the reply is the whole paper

  Scenario: A line range comes back with line numbers
    When I read lines 3 to 3 of "main.tex"
    Then the reply is line 3, numbered, reading "Hello world."

  Scenario: A suggestion nobody has accepted yet reads as if it had been
    Given a collaborator has suggested inserting "big " before "world"
    When I read "main.tex"
    Then the reply says "Hello big world."

  Scenario: Text in other scripts reads back as it was written
    Given the project has a document "chinese.tex" reading "第一节：方法，我们提出一个新方法。"
    When I read "chinese.tex"
    Then the reply says "第一节：方法，我们提出一个新方法。"

  Scenario: An uploaded figure comes back as an image
    Given the project has an uploaded figure "plot.png"
    When I read "plot.png"
    Then the reply says "plot.png: PNG image, 3 by 2 pixels"
    And the reply holds the figure as a PNG image

  Scenario: An upload that is not an image is refused and the project archive is suggested instead
    Given the project has an uploaded file "data.zip"
    When I read "data.zip"
    Then the read is refused
    And the reply says "manage_project (action download_zip)"

  Scenario: A wrong path is answered with the documents that do exist
    When I read "nope.tex"
    Then the read is refused
    And the reply says 'No editable document at "nope.tex"'
    And the reply says "sections/intro.tex"

  Scenario: A start line after the end line is refused
    When I read lines 4 to 2 of "main.tex"
    Then the read is refused
    And the reply says "startLine must not exceed endLine."

  Scenario: A start line past the end of the document is refused
    When I read lines 5 to 6 of "main.tex"
    Then the read is refused
    And the reply says "main.tex has only 4 lines, so line 5 is past the end."
