/** Where BibTeX 0.99d and biber read the same .bib text differently. */
export interface BibliographyReadingRules {
  /** biber skips a line that starts with `%`; to BibTeX it is text like any other. */
  readonly skipsLinesStartingWithPercent: boolean;
  /** BibTeX stops reading a file once a command or entry ends on its last line. */
  readonly stopsAtTheLastLine: boolean;
  /** Macros defined before a .bib file is read, by lower-cased name. */
  readonly predefinedMacros: ReadonlyMap<string, string>;
  /** A macro nothing defines: both programs expand it to nothing, with a warning. */
  readonly undefinedMacro: "expands to nothing" | "stays as written";
}

const MONTHS = [
  ["jan", "January"],
  ["feb", "February"],
  ["mar", "March"],
  ["apr", "April"],
  ["may", "May"],
  ["jun", "June"],
  ["jul", "July"],
  ["aug", "August"],
  ["sep", "September"],
  ["oct", "October"],
  ["nov", "November"],
  ["dec", "December"],
] as const;

/**
 * The style defines the month macros. plain.bst, unsrt.bst, alpha.bst, plainnat.bst and
 * apalike.bst spell the months out; abbrv.bst, IEEEtran.bst and others write "Jan." and so on.
 */
export const BIBTEX_READING_RULES: BibliographyReadingRules = {
  skipsLinesStartingWithPercent: false,
  stopsAtTheLastLine: true,
  predefinedMacros: new Map(MONTHS),
  undefinedMacro: "expands to nothing",
};

/** biber defines jan to dec as 1 to 12, the month numbers biblatex wants. */
export const BIBER_READING_RULES: BibliographyReadingRules = {
  skipsLinesStartingWithPercent: true,
  stopsAtTheLastLine: false,
  predefinedMacros: new Map(MONTHS.map(([name], index) => [name, String(index + 1)])),
  undefinedMacro: "expands to nothing",
};

/**
 * For .bib text whose program is unknown: a `%` line is read and so is what follows the last
 * line, so neither rule set's entries are missed, and only the macros the text defines expand,
 * so a name such as Crossref's `month = June` keeps what it was written as.
 */
export const UNKNOWN_PROGRAM_READING_RULES: BibliographyReadingRules = {
  skipsLinesStartingWithPercent: false,
  stopsAtTheLastLine: false,
  predefinedMacros: new Map(),
  undefinedMacro: "stays as written",
};
