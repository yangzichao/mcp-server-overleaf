/**
 * Turns off the maintenance Git starts on its own after fetch, commit and rebase.
 *
 * Git runs it as `git maintenance run --auto --detach`, so it outlives the command that
 * started it, and the server that ran that command. It can still be writing inside a clone
 * while a test deletes the clone, and the delete then fails with ENOTEMPTY. Setting it
 * through the environment reaches every git a test starts: directly, in-process through
 * OverleafGitRepository, or inside a spawned server.
 */
export const WITHOUT_BACKGROUND_GIT_MAINTENANCE = {
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "maintenance.auto",
  GIT_CONFIG_VALUE_0: "false",
} as const;
