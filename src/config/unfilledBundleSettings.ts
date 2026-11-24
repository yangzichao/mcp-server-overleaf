/**
 * Claude Desktop starts the bundle with `${user_config.KEY}` in its environment for every setting,
 * and the MCPB manifest specification does not say what an optional setting the user left empty
 * becomes. If it arrives as the placeholder itself, it would read as a token or cookie that was
 * set, and fail at Overleaf instead of reporting what is missing. So a value that is still exactly
 * the placeholder is treated as unset.
 */
const UNFILLED_PLACEHOLDER_PATTERN = /^\$\{user_config\.[A-Za-z0-9_]+\}$/;

export function dropUnfilledBundleSettings(environment: NodeJS.ProcessEnv = process.env): void {
  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined && UNFILLED_PLACEHOLDER_PATTERN.test(value.trim())) delete environment[name];
  }
}
