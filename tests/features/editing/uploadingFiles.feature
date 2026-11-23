Feature: A figure or other file is added to the project byte for byte

  manage_files (action upload) copies a file from this computer, or decodes base64 content,
  into the local clone. Like every edit it reaches Overleaf only when pushed. It refuses to
  read from a hidden folder such as ~/.ssh, so a figure upload cannot become a way to leak a
  key.

  Background:
    Given the co-author has published a paper and shared notes
    And this computer has a figure "plot.png"

  Scenario: An uploaded figure reaches Overleaf unchanged, once pushed
    When I upload "plot.png" from this computer as "figures/plot.png"
    Then the reply says "Added figures/plot.png (13 bytes) in the local clone."
    And Overleaf does not hold "figures/plot.png" yet
    When I push the work as "Add the plot"
    Then Overleaf holds the figure's exact bytes at "figures/plot.png"

  Scenario: Uploaded content replaces a file that already exists
    When I upload base64 content "\documentclass{book}" as "main.tex"
    Then the reply says "Replaced main.tex"
    And "main.tex" reads back "\documentclass{book}"

  Scenario Outline: An unsafe upload is refused
    When I upload <unsafe upload>
    Then the upload is refused with "<reason>"
    And there is nothing pending

    Examples:
      | unsafe upload                                | reason                                       |
      | a key file from a hidden folder              | Refusing to upload from a hidden path (.ssh) |
      | from a relative source path                  | absolute path                                |
      | with both a source path and base64 content   | exactly one of sourcePath and contentBase64  |
      | base64 content that does not decode          | not valid base64                             |
      | the figure to a path outside the project     | resolves outside the project                 |
