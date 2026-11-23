Feature: The whole project, binary files included, can be saved as a ZIP

  manage_project (action download_zip) does what the editor's Download Source menu does, for
  archiving or for a submission system such as arXiv. Like a saved PDF, the archive replaces
  only an earlier archive.

  Background:
    Given I am signed in to Overleaf

  Scenario: The archive is saved where asked
    When I download the project as "paper.zip"
    Then the reply says the archive was saved as "paper.zip"
    And "paper.zip" in the download folder holds the archive Overleaf built

  Scenario: An earlier archive at that path is replaced
    Given the download folder already holds an older archive named "paper.zip"
    When I download the project as "paper.zip"
    Then "paper.zip" in the download folder holds the archive Overleaf built

  Scenario: A file that is not an archive is never overwritten
    Given the download folder holds my notes, misnamed "notes.zip"
    When I download the project as "notes.zip"
    Then the reply says "already exists and is not a ZIP archive"
    And "notes.zip" in the download folder still holds my notes

  Scenario: A folder that does not exist is refused
    When I download the project as "missing/paper.zip"
    Then the reply says "does not exist. Nothing was saved."

  Scenario: A path that does not end in .zip is refused
    When I download the project as "paper.tar"
    Then the reply says "must end in .zip"
    And there is no "paper.tar" in the download folder

  Scenario: A relative path is refused
    When I download the project to the relative path "paper.zip"
    Then the reply says "Give an absolute path to save the ZIP archive to"
