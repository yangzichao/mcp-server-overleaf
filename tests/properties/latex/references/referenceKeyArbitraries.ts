import fc from "fast-check";

/** Keys as authors write them: letters, digits and the punctuation BibTeX and \label allow. */
export const referenceKey = fc.stringMatching(/^[A-Za-z0-9:_.\-+/]{1,10}$/);

/** Prose between commands, with no backslash or brace that could start or end one. */
export const prose = fc.stringMatching(/^[A-Za-z0-9 ,.;:\n]{0,10}$/);

export const keySpacing = fc.constantFrom("", " ", "  ", "\n");
