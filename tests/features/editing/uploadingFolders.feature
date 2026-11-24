Feature: A folder from this computer is copied into the project, subfolders and all

  manage_files (action upload_folder) copies every file under a folder on this computer into a
  directory of the local clone and keeps the subfolders. Hidden files and folders, such as a
  .git or a .env, stay on this computer, and so do symbolic links, so a copy cannot reach past
  the folder. Every path is checked before the first file is written, and like every edit the
  copy reaches Overleaf only when it is pushed.

  Background:
    Given the co-author has published a paper and shared notes
    And this computer has a folder "plots" holding "loss.png" and "data/raw.csv"

  Scenario: A folder reaches Overleaf with its subfolders, once pushed
    When I upload the folder "plots" into "figures"
    Then the reply says "Copied 2 files (21 bytes) from"
    And the reply says "into figures in the local clone."
    And the reply says "- figures/data/raw.csv (added, 8 bytes)"
    And the reply says "- figures/loss.png (added, 13 bytes)"
    And Overleaf does not hold "figures/loss.png" yet
    When I push the work as "Add the plots"
    Then Overleaf holds every file of "plots" byte for byte under "figures"

  Scenario: Hidden files and symbolic links stay on this computer
    Given the folder "plots" also holds a hidden ".env" and a link "shared.png" to a file outside it
    When I upload the folder "plots" into "figures"
    Then the reply says "Left out 2 entries: .env (hidden), shared.png (a symbolic link)."
    When I push the work as "Add the plots"
    Then the files Overleaf holds under "figures" are "figures/data/raw.csv" and "figures/loss.png"

  Scenario: "." copies into the project's root folder and replaces a file already there
    Given the folder "plots" also holds "notes.tex" reading "Notes from this computer."
    When I upload the folder "plots" into "."
    Then the reply says "into the project's root folder in the local clone, 1 of them replacing files already there."
    And the reply says "- notes.tex (replaced"
    And "notes.tex" reads back "Notes from this computer."

  Scenario: A file where a folder would go stops the whole copy
    When I upload the folder "plots" into "notes.tex"
    Then the copy is refused with "notes.tex is a file in the project, so notes.tex/data/raw.csv cannot go inside it. Nothing was copied."
    And there is nothing pending

  Scenario: A folder where a file would go stops the whole copy
    Given the co-author has published "figures/loss.png/first-run.png"
    When I upload the folder "plots" into "figures"
    Then the copy is refused with "figures/loss.png is a folder in the project, so a file cannot be copied there. Nothing was copied."
    And there is nothing pending

  Scenario Outline: A folder upload that cannot be done safely is refused and changes nothing
    When I upload <unsafe folder>
    Then the copy is refused with "<reason>"
    And there is nothing pending

    Examples:
      | unsafe folder                           | reason                                                    |
      | a hidden folder such as ~/.ssh          | Refusing to upload from a hidden path (.ssh)              |
      | from a relative source path             | sourcePath must be an absolute path to a folder           |
      | a file instead of a folder              | is not a folder on this computer                          |
      | a folder holding only hidden files      | holds no file that would be copied                        |
      | a folder holding 181 files              | more than 180 files, the most Overleaf's upload dialog takes at once |
      | a folder with a name Overleaf refuses   | figures/a*b.png cannot go to Overleaf                     |
      | the folder into the clone's .git        | Refusing to touch the .git directory                      |
      | the folder into a path outside the project | ../outside/data/raw.csv cannot go to Overleaf          |
