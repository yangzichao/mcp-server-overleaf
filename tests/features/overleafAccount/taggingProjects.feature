Feature: Projects can be grouped under this account's tags

  Tags are the folders of Overleaf's project list. They belong to the signed-in account, so
  manage_project (actions tag and untag) changes nothing co-authors see. A tag's name is
  matched ignoring case, so "thesis" finds an existing "Thesis" instead of making a second one.

  Background:
    Given I am signed in to Overleaf

  Scenario: Tagging with a name the account has no tag for creates the tag
    When I tag "Fake paper" with "Submitted"
    Then the reply says 'Tagged "Fake paper" with "Submitted", a tag this account did not have before.'
    And the account's tags are "Submitted"
    And the tag "Submitted" holds "Fake paper"

  Scenario: A tag whose name differs only in case is reused
    Given the account has a tag "Thesis" holding no projects
    When I tag "Shared Thesis" with "thesis"
    Then the reply says the project was tagged with "Thesis", and co-authors see no change
    And the account's tags are "Thesis"
    And the tag "Thesis" holds "Shared Thesis"

  Scenario: Tagging a project that already has the tag changes nothing
    Given the account has a tag "Thesis" holding "Shared Thesis"
    When I tag "Shared Thesis" with "Thesis"
    Then the reply says 'already has the tag "Thesis"; nothing changed.'

  Scenario: Untagging takes the project out and keeps the tag
    Given the account has a tag "Thesis" holding "Shared Thesis"
    When I untag "Shared Thesis" from "Thesis"
    Then the reply says 'Removed the tag "Thesis" from "Shared Thesis"; the tag itself stays.'
    And the tag "Thesis" holds no projects

  Scenario: Untagging a project that does not have the tag changes nothing
    Given the account has a tag "Thesis" holding no projects
    When I untag "Shared Thesis" from "Thesis"
    Then the reply says 'does not have the tag "Thesis"; nothing changed.'

  Scenario: Untagging with a tag the account does not have names the tags it has
    Given the account has a tag "Thesis" holding "Shared Thesis"
    When I untag "Shared Thesis" from "Drafts"
    Then the reply is an error
    And the reply says 'This account has no tag named "Drafts". Its tags are "Thesis".'
    And the tag "Thesis" holds "Shared Thesis"

  Scenario: Tagging needs the tag's name
    When I tag "Fake paper" without naming a tag
    Then the reply is an error
    And the reply says "tag needs tag."
