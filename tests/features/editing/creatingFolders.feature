Feature: An empty folder is made in Overleaf at once

  Git records only files, so a folder with nothing in it cannot travel through push_changes.
  With a session cookie beside the Git token, manage_files (action create_folder) asks
  Overleaf's editor to make the folder straight away, where co-authors see it at once.

  Background:
    Given I am signed in to Overleaf

  Scenario: A folder and its missing parent appear in Overleaf right away
    When I create the folder "figures/plots"
    Then the reply says "Created the folder figures/plots in Overleaf, with its missing parent folder figures."
    And the reply says "It is in Overleaf now; co-authors see it already."
    And Overleaf's project has the folders "figures" and "figures/plots"
    And nothing is pending in the local clone

  Scenario: A folder that already exists is left alone
    When I create the folder "sections"
    Then the reply says "sections is already a folder in Overleaf, so nothing was created."

  Scenario: A folder cannot be made inside a file
    When I create the folder "main.tex/inner"
    Then the reply is an error
    And the reply says "main.tex is an editable document in Overleaf, not a folder"
    And Overleaf's project has nothing at "main.tex/inner"

  Scenario: An account that cannot edit the project is refused
    Given my access to the project is "review"
    When I create the folder "drafts"
    Then the reply is an error
    And the reply says "needs edit access"
    And Overleaf's project has nothing at "drafts"

  Scenario: The folder to create is required
    When I create a folder without naming it
    Then the reply is an error
    And the reply says "create_folder needs path."
