import type { BibliographyReadingRules } from "./bibliographyReadingRules.js";

/**
 * The macros a .bib file can use: the program's own, then each @string in the order read. One
 * table serves every file a document names, as one run of BibTeX does. Names match without
 * regard to case, and a value is expanded when it is defined, not when it is used.
 */
export class BibliographyMacros {
  private readonly valuesByLowerCaseName: Map<string, string>;

  constructor(private readonly rules: BibliographyReadingRules) {
    this.valuesByLowerCaseName = new Map(rules.predefinedMacros);
  }

  define(name: string, value: string): void {
    this.valuesByLowerCaseName.set(name.toLowerCase(), value);
  }

  /** `definitionBeingRead` names the @string the use sits in: BibTeX expands that to nothing. */
  expand(name: string, definitionBeingRead?: string): string {
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName === definitionBeingRead?.toLowerCase()) return "";
    const value = this.valuesByLowerCaseName.get(lowerCaseName);
    if (value !== undefined) return value;
    return this.rules.undefinedMacro === "stays as written" ? name : "";
  }
}
