Feature: A new project can be made from a ZIP archive on this computer

  manage_project (action create_from_zip) uploads a ZIP the way the dashboard's Upload Project
  does, for a paper written elsewhere or a template from a publisher. The new project belongs
  to this account and takes the file's name unless another is given.

  Background:
    Given I am signed in to Overleaf

  Scenario: The new project is named after the archive
    Given the download folder holds a ZIP archive named "Conference Paper.zip"
    When I create a project from "Conference Paper.zip"
    Then the reply gives the Overleaf address of the new project "Conference Paper"
    And the account owns a project named "Conference Paper"

  Scenario: A name given replaces the archive's name
    Given the download folder holds a ZIP archive named "Conference Paper.zip"
    When I create a project named "Camera Ready" from "Conference Paper.zip"
    Then the reply gives the Overleaf address of the new project "Camera Ready"
    And the account owns a project named "Camera Ready"

  Scenario: A file that is not a ZIP archive is refused before anything is uploaded
    Given the download folder holds my notes, misnamed "notes.zip"
    When I create a project from "notes.zip"
    Then the reply is an error
    And the reply says "That file is not a ZIP archive"
    And nothing was uploaded to Overleaf

  Scenario: An archive that does not exist is refused
    When I create a project from "missing.zip"
    Then the reply is an error
    And the reply says "missing.zip is not a file on this computer."
    And nothing was uploaded to Overleaf

  Scenario: A relative path is refused
    When I create a project from the relative path "paper.zip"
    Then the reply is an error
    And the reply says "sourcePath must be an absolute path"
    And nothing was uploaded to Overleaf

  Scenario: An archive Overleaf rejects is reported with Overleaf's reason
    Given the download folder holds a ZIP archive named "Conference Paper.zip"
    And Overleaf will reject the next upload because "The archive has no .tex file"
    When I create a project from "Conference Paper.zip"
    Then the reply is an error
    And the reply says "The archive has no .tex file"
    And the account holds only the projects it held before
