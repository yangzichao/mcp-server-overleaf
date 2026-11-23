import fc from "fast-check";

export const referenceKey = fc.stringMatching(/^[A-Za-z0-9:_.\-+/]{1,10}$/);

export const prose = fc.stringMatching(/^[A-Za-z0-9 ,.;:\n]{0,10}$/);

export const keySpacing = fc.constantFrom("", " ", "  ", "\n");
