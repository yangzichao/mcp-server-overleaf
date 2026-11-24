/**
 * A scenario tagged @bug states what a tool should do and does not yet. It stays in the
 * feature file as the contract and is left out of the run until the fix lands. "ignore" is
 * vitest-cucumber's own default, kept because passing excludeTags replaces it.
 */
export const KNOWN_BUGS_LEFT_OUT = { excludeTags: ["bug", "ignore"] };
