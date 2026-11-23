import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  BIBTEX_FIELD_ORDER,
  createBibtexDraft,
  formatBibtexEntry,
} from "../../../../../src/citations/find/bibtex/bibtexEntry.js";
import { parseBibliographyRecords } from "../../../../../src/citations/parseBibliographyRecords.js";
import { parseBibliographyEntries } from "../../../../../src/latex/references/parseBibliographyEntries.js";
import { entryType, rawCitationFields } from "./rawCitationMetadata.js";

/**
 * True when the braces balance as BibTeX counts them, every brace, `\{` and `\}` included, or,
 * with `skippingEscaped`, as the .bib readers here count them, which skip the character after a
 * backslash. A value must balance both ways for both to see its end at the same brace.
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

/** A backslash at the end with none before it would escape the brace written after the value. */
function endsInLoneBackslash(value: string): boolean {
  return /(?<!\\)(?:\\\\)*\\$/.test(value);
}

/** True when every `&`, `%` and `#` follows an odd run of backslashes, which escapes it. */
function specialsEscaped(value: string): boolean {
  return [...value.matchAll(/(\\*)[&%#]/g)].every((match) => (match[1] ?? "").length % 2 === 1);
}

/** The commands markupToLatex writes, each of which needs its argument in braces right after it. */
const MARKUP_COMMAND_WITHOUT_ARGUMENT = /\\text(?:it|bf|sc|subscript|superscript)(?!\{)/;

const key = fc.stringMatching(/^[a-z][a-z0-9]{0,15}$/);

describe("BibTeX entry properties", () => {
  // Found by this property: a series of `\` once made an entry neither reader could read,
  // because for them the backslash escaped the brace that closes the value.
  it("writes an entry both .bib readers read back, with every field as it was made", () => {
    fc.assert(
      fc.property(entryType, rawCitationFields, key, (type, raw, chosenKey) => {
        const draft = createBibtexDraft(type, raw);
        const written = formatBibtexEntry({ ...draft, key: chosenKey });
        const records = parseBibliographyRecords("found.bib", written);
        expect(records.map((record) => [record.key, record.entryType])).toEqual([
          [chosenKey, draft.entryType],
        ]);
        expect(records[0]?.fields).toEqual(
          new Map([...draft.fields].map(([name, value]) => [name.toLowerCase(), value])),
        );
        expect(parseBibliographyEntries("found.bib", written).map((entry) => entry.key)).toEqual([chosenKey]);
      }),
    );
  });

  // Found by this property: an organization of `\{` once kept its brace, because only braces
  // without a backslash were balanced, and BibTeX counts the others too. And an edition of
  // `\\#` once kept its `#` unescaped, because any backslash before it was taken to escape it.
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

  // Found by this property: a series of `<sub>2</sub>}` once became `\textsubscript2`, because
  // one brace that did not balance made every brace go, the argument's too.
  it("keeps the argument braces of every command it makes from markup", () => {
    fc.assert(
      fc.property(entryType, rawCitationFields, (type, raw) => {
        for (const value of createBibtexDraft(type, raw).fields.values()) {
          expect(value).not.toMatch(MARKUP_COMMAND_WITHOUT_ARGUMENT);
        }
      }),
    );
  });

  // Found by this property: an entry with no fields once had an empty line between its braces.
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
