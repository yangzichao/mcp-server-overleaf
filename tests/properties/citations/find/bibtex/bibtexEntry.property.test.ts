import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  BIBTEX_FIELD_ORDER,
  createBibtexDraft,
  formatBibtexEntry,
} from "../../../../../src/citations/find/bibtex/bibtexEntry.js";
import { parseBibliographyRecords } from "../../../../../src/citations/parseBibliographyRecords.js";
import {
  BIBTEX_READING_RULES,
  UNKNOWN_PROGRAM_READING_RULES,
} from "../../../../../src/latex/bibliography/bibliographyReadingRules.js";
import { parseBibliographyEntries } from "../../../../../src/latex/references/parseBibliographyEntries.js";
import { entryType, rawCitationFields } from "./rawCitationMetadata.js";

/**
 * True when the braces balance as BibTeX counts them, every brace, `\{` and `\}` included, or,
 * with `skippingEscaped`, as TeX counts them, where `\{` and `\}` are braces to print. A value
 * must balance both ways: BibTeX ends it at its closing brace, and TeX then reads it.
 */
function bracesBalance(value: string, skippingEscaped: boolean): boolean {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && skippingEscaped) index += 1;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth < 0) return false;
  }
  return depth === 0;
}

function endsInLoneBackslash(value: string): boolean {
  return /(?<!\\)(?:\\\\)*\\$/.test(value);
}

/** True when every `&`, `%` and `#` follows an odd run of backslashes, which escapes it. */
function specialsEscaped(value: string): boolean {
  return [...value.matchAll(/(\\*)[&%#]/g)].every((match) => (match[1] ?? "").length % 2 === 1);
}

const MARKUP_COMMAND_WITHOUT_ARGUMENT = /\\text(?:it|bf|sc|subscript|superscript)(?!\{)/;

const key = fc.stringMatching(/^[a-z][a-z0-9]{0,15}$/);

describe("BibTeX entry properties", () => {
  it("writes an entry both .bib readers read back, with every field as it was made", () => {
    fc.assert(
      fc.property(entryType, rawCitationFields, key, (type, raw, chosenKey) => {
        const draft = createBibtexDraft(type, raw);
        const files = [{ path: "found.bib", text: formatBibtexEntry({ ...draft, key: chosenKey }) }];
        const records = parseBibliographyRecords(files, UNKNOWN_PROGRAM_READING_RULES);
        expect(records.map((record) => [record.key, record.entryType])).toEqual([
          [chosenKey, draft.entryType],
        ]);
        const fieldsMade = new Map([...draft.fields].map(([name, value]) => [name.toLowerCase(), value]));
        expect(records[0]?.fields).toEqual(fieldsMade);
        expect(parseBibliographyEntries(files, BIBTEX_READING_RULES).map((entry) => entry.key)).toEqual([
          chosenKey,
        ]);
      }),
    );
  });

  it("writes an entry BibTeX reads with the month its style names", () => {
    fc.assert(
      fc.property(entryType, rawCitationFields, key, (type, raw, chosenKey) => {
        const draft = createBibtexDraft(type, raw);
        const files = [{ path: "found.bib", text: formatBibtexEntry({ ...draft, key: chosenKey }) }];
        const monthMacros = BIBTEX_READING_RULES.predefinedMacros;
        const fieldsBibtexReads = new Map(
          [...draft.fields].map(([name, value]) => [
            name.toLowerCase(),
            name === "month" ? (monthMacros.get(value) ?? value) : value,
          ]),
        );
        expect(parseBibliographyRecords(files, BIBTEX_READING_RULES)[0]?.fields).toEqual(fieldsBibtexReads);
      }),
    );
  });

  it("makes values whose braces balance both ways, with no lone backslash at the end and &, % and # escaped", () => {
    fc.assert(
      fc.property(entryType, rawCitationFields, (type, raw) => {
        for (const [name, value] of createBibtexDraft(type, raw).fields) {
          expect(bracesBalance(value, true)).toBe(true);
          expect(bracesBalance(value, false)).toBe(true);
          expect(endsInLoneBackslash(value)).toBe(false);
          if (!["doi", "eprint", "url"].includes(name)) expect(specialsEscaped(value)).toBe(true);
          expect(value).toBe(value.trim());
          expect(value).not.toMatch(/\s\s|\n/);
        }
      }),
    );
  });

  it("keeps the argument braces of every command it makes from markup", () => {
    fc.assert(
      fc.property(entryType, rawCitationFields, (type, raw) => {
        for (const value of createBibtexDraft(type, raw).fields.values()) {
          expect(value).not.toMatch(MARKUP_COMMAND_WITHOUT_ARGUMENT);
        }
      }),
    );
  });

  it("writes the fields it has in the fixed order, one to a line, with no comma after the last", () => {
    fc.assert(
      fc.property(entryType, rawCitationFields, key, (type, raw, chosenKey) => {
        const draft = createBibtexDraft(type, raw);
        const lines = formatBibtexEntry({ ...draft, key: chosenKey }).split("\n");
        expect(lines[0]).toBe(`@${type.toLowerCase()}{${chosenKey},`);
        expect(lines.at(-1)).toBe("}");
        const fieldLines = lines.slice(1, -1);
        const names = fieldLines.map((line) => /^ {2}(\w+) = /.exec(line)?.[1]);
        expect(names).toEqual(BIBTEX_FIELD_ORDER.filter((name) => draft.fields.has(name)));
        fieldLines.forEach((line, index) => {
          expect(line.endsWith(",")).toBe(index < fieldLines.length - 1);
        });
      }),
    );
  });
});
