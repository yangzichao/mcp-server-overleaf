Feature: Without Git integration, a project is named by its address, its id, or a registered name

  A session cookie covers the whole account, so any project the account can open is reachable
  by its Overleaf address or id. A project registered with no Git token becomes the default, and
  without one the tools ask which project is meant rather than guessing.

  Scenario: A project registered without a Git token is the default
    Given the server was given "only a session cookie"
    When I list the configured projects
    Then the reply says "paper  (default)"
    When I list the tracked changes in "main.tex" without naming a project
    Then the reply says "No tracked changes in main.tex."

  Scenario: A project is reached by its Overleaf address
    Given the server was given "only a session cookie and no registered project"
    When I list the tracked changes in "main.tex" of the project at its Overleaf address
    Then the reply says "No tracked changes in main.tex."

  Scenario: A project is reached by its id
    Given the server was given "only a session cookie and no registered project"
    When I list the tracked changes in "main.tex" of the project by its id
    Then the reply says "No tracked changes in main.tex."

  Scenario: Without a project or a default, the reply asks which project is meant
    Given the server was given "only a session cookie and no registered project"
    When I list the tracked changes in "main.tex" without naming a project
    Then the reply says "No project given and no default is configured."

  Scenario: A project the account cannot open is reported as such
    Given the server was given "only a session cookie and no registered project"
    When I list the tracked changes in "main.tex" of the project "64ffffffffffffffffffffff"
    Then the reply says "not authorized to open this project"
