Feature: A server with no credentials starts anyway and says what is missing

  A client may start the server before anyone has set it up: a directory's sandbox does,
  and so does a desktop bundle with only the project address filled in. The server still
  answers and lists its tools, and every call names the missing token and how to set it up.

  Scenario: The tools are offered even with no credentials
    Given the server was started with no credentials at all
    Then these tools are offered:
      | tool              |
      | list_projects     |
      | read_file         |
      | edit_file         |
      | push_changes      |
      | compile_project   |
      | look_up_citations |
    And the server's error output names the missing token

  Scenario Outline: Every call names the missing token and how to set it up
    Given the server was started with no credentials at all
    When I call <tool>
    Then the reply names the missing token and how to set it up

    Examples:
      | tool          |
      | list_projects |
      | read_project  |
      | read_file     |
      | edit_file     |
      | push_changes  |
      | read_history  |

  Scenario: Naming a project by its address does not get around the missing token
    Given the server was started with no credentials at all
    When I read "main.tex" from "https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1"
    Then the call fails, naming the missing token

  Scenario Outline: A desktop bundle with only the project address filled in explains itself
    Given the server was started from the desktop bundle with the token left <unfilled>
    When I read "main.tex" from the configured project
    Then the call fails, naming the missing token

    Examples:
      | unfilled           |
      | empty              |
      | as its placeholder |
