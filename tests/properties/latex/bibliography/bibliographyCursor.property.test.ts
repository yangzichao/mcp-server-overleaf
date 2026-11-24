import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { BibliographyCursor } from "../../../../src/latex/bibliography/bibliographyCursor.js";

const NOT_IN_A_NAME = /[\s"#%'(),={}]/;

const braced = fc
  .array(fc.constantFrom("word", " ", "{x}", "{a{b}c}", '"', "\\", "#", "%", "北京", "𝔸", ","), {
    maxLength: 5,
  })
  .map((pieces) => pieces.join(""));
const quotedInside = fc
  .array(fc.constantFrom("word", " ", "{x}", '{"}', "\\", "#", "%", "北京", ","), { maxLength: 5 })
  .map((pieces) => pieces.join(""));
const macroName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_.:+-]{0,6}$/);

const valuePart = fc.oneof(
  braced.map((inside) => ({ written: `{${inside}}`, read: inside })),
  quotedInside.map((inside) => ({ written: `"${inside}"`, read: inside })),
  fc.stringMatching(/^[0-9]{1,4}$/).map((digits) => ({ written: digits, read: digits })),
  macroName.map((name) => ({ written: name, read: `<${name.toLowerCase()}>` })),
);
const space = fc.constantFrom("", " ", "\n", "\t ");
const writtenValue = fc
  .array(fc.tuple(valuePart, space, space), { minLength: 1, maxLength: 4 })
  .map((parts) => ({
    written: parts.map(([part, before, after]) => `${before}${part.written}${after}`).join("#"),
    read: parts.map(([part]) => part.read).join(""),
  }));
const valueEnd = fc.constantFrom(",", "}", ")", "", ",\n  title = {x}");

const expandMacro = (name: string) => `<${name.toLowerCase()}>`;

const anyBibText = fc
  .array(fc.constantFrom("{", "}", '"', "#", ",", " ", "\n", "a", "1", "%", "=", "(", ")", "@", "北"), {
    maxLength: 20,
  })
  .map((pieces) => pieces.join(""));

describe("BibliographyCursor properties", () => {
  it("reads a value of braced, quoted, numeric and macro parts joined with #, stopping where it ends", () => {
    fc.assert(
      fc.property(fc.constantFrom("", "@misc{k, title ="), writtenValue, valueEnd, (before, value, after) => {
        const text = `${before}${value.written}${after}`;
        const cursor = new BibliographyCursor(text, before.length);
        expect(cursor.readValue(expandMacro)).toBe(value.read);
        expect(text.slice(cursor.position)).toBe(after);
      }),
    );
  });

  it("never throws or moves backwards or past the end, whatever it is asked to read", () => {
    fc.assert(
      fc.property(
        anyBibText,
        fc.nat(),
        fc.constantFrom("value", "name", "key}", "key)"),
        (text, startSeed, read) => {
          const start = text.length === 0 ? 0 : startSeed % (text.length + 1);
          const cursor = new BibliographyCursor(text, start);
          if (read === "value") cursor.readValue(expandMacro);
          else if (read === "name") cursor.readName();
          else cursor.readKey(read.slice(-1));
          expect(cursor.position).toBeGreaterThanOrEqual(start);
          expect(cursor.position).toBeLessThanOrEqual(text.length);
        },
      ),
    );
  });

  it("reads a name that does not start with a digit and holds none of the characters BibTeX ends a name at", () => {
    fc.assert(
      fc.property(anyBibText, (text) => {
        const cursor = new BibliographyCursor(text, 0);
        const name = cursor.readName();
        expect(cursor.position).toBe(name.length);
        expect(text.startsWith(name)).toBe(true);
        if (name !== "") {
          expect(name[0]).not.toMatch(/[0-9]/);
          expect(name).not.toMatch(NOT_IN_A_NAME);
        }
      }),
    );
  });

  it("reads a key up to a comma or white space, and up to a } only in an entry opened with {", () => {
    fc.assert(
      fc.property(anyBibText, fc.constantFrom("}", ")"), (text, closer) => {
        const cursor = new BibliographyCursor(text, 0);
        const key = cursor.readKey(closer);
        expect(key).not.toMatch(/[\s,]/);
        if (closer === "}") expect(key).not.toContain("}");
        const next = text[key.length];
        if (next !== undefined)
          expect(next === "," || /\s/.test(next) || (closer === "}" && next === "}")).toBe(true);
      }),
    );
  });
});
