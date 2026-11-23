Feature: The tools on offer follow the credentials the server was given

  A Git token reaches Overleaf's Git bridge; a session cookie reaches Overleaf's editor and web
  application. A tool, and each action, view or place of one, is offered only when the
  credential it needs is configured, so nothing is offered that could only answer with a setup
  note.

  Scenario: With only a Git token, none of the session-cookie tools are offered
    Given the server was given "only a Git token"
    Then none of these tools are offered:
      | tool                   |
      | read_review            |
      | manage_tracked_changes |
      | manage_comments        |
      | manage_project         |
    But these tools are offered:
      | tool         |
      | read_file    |
      | edit_file    |
      | push_changes |
    And none of these choices are offered:
      | tool            | choice        |
      | read_project    | members       |
      | manage_files    | create_folder |
      | compile_project | overleaf      |

  Scenario: Adding a session cookie offers the review and account tools beside the Git tools
    Given the server was given "a Git token and a session cookie"
    Then these tools are offered:
      | tool                   |
      | read_review            |
      | manage_tracked_changes |
      | manage_comments        |
      | manage_project         |
      | list_projects          |
      | push_changes           |
      | edit_file              |
      | compile_project        |
    And these choices are offered:
      | tool            | choice        |
      | read_project    | members       |
      | manage_files    | create_folder |
      | compile_project | local         |
      | compile_project | overleaf      |

  Scenario: With only a session cookie, the tools that need a Git clone are left out
    Given the server was given "only a session cookie"
    Then 13 tools are offered
    And these tools are offered:
      | tool                   |
      | list_projects          |
      | read_project           |
      | read_file              |
      | search_project         |
      | edit_file              |
      | manage_files           |
      | manage_tracked_changes |
      | read_review            |
      | compile_project        |
      | manage_project         |
    But none of these tools are offered:
      | tool         |
      | push_changes |
      | read_history |
    And none of these choices are offered:
      | tool            | choice                |
      | read_project    | status                |
      | read_project    | changes               |
      | manage_files    | restore               |
      | manage_files    | discard_local_changes |
      | compile_project | local                 |

  Scenario: With only a session cookie, the instructions do not tell the model to push
    Given the server was given "only a session cookie"
    Then the server's instructions say "No Git credential is configured"
    And the server's instructions do not mention "push_changes"
    And every tool, action and view the server's instructions name is offered
