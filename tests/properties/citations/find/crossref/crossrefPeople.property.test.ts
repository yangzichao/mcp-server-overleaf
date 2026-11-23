import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { crossrefNameList } from "../../../../../src/citations/find/crossref/crossrefPeople.js";

/** Whitespace-separated words outside braces, as BibTeX reads a name list. */
function wordsOutsideBraces(text: string): string[] {
  const words: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of text) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0 && /\s/.test(character)) {
      if (current !== "") words.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  return current === "" ? words : [...words, current];
}

/** The names BibTeX reads: a list split at each word "and", in any case, outside braces. */
function bibtexNames(list: string): string[] {
  const names: string[][] = [[]];
  for (const word of wordsOutsideBraces(list)) {
    if (word.toLowerCase() === "and") names.push([]);
    else names.at(-1)?.push(word);
  }
  return names.map((words) => words.join(" "));
}

/**
 * What BibTeX prints for `{vv~}{ll}`: before the first comma when there is one; otherwise from
 * the first lower-case word before the final word on, or the final word alone.
 */
function vonAndLast(name: string): string {
  const [beforeComma = "", ...afterComma] = name.split(",");
  if (afterComma.length > 0) return beforeComma.trim();
  const words = wordsOutsideBraces(name);
  const firstLowerCase = words.findIndex((word, index) => index < words.length - 1 && /^[a-z]/.test(word));
  return (firstLowerCase === -1 ? words.slice(-1) : words.slice(firstLowerCase)).join(" ");
}

const person = fc.record(
  {
    family: fc.constantFrom(
      "Garcia Perez",
      "Plato",
      "van Gogh",
      "LeCun",
      "de la Fontaine",
      "Smith and Wesson",
      "",
    ),
    given: fc.constantFrom("Yann", "Maria José", "Jean-Pierre", ""),
    suffix: fc.constantFrom("Jr.", ""),
    name: fc.constantFrom("World Health Organization", "Barnes and Noble", ""),
  },
  { requiredKeys: [] },
);

/** The whole family name a person should keep, or an organisation's name braced whole. */
function expectedVonAndLast(written: { family?: string; given?: string; name?: string }): string | undefined {
  if (written.family) return written.family;
  const name = written.name || written.given;
  return name ? `{${name}}` : undefined;
}

describe("crossrefNameList properties", () => {
  it("never throws, whatever Crossref sends for its people", () => {
    const people = fc.oneof(
      fc.anything(),
      fc.array(fc.dictionary(fc.constantFrom("family", "given", "suffix", "name"), fc.anything())),
    );
    fc.assert(
      fc.property(people, (sent) => {
        const list = crossrefNameList(sent);
        expect(list === undefined || typeof list === "string").toBe(true);
      }),
    );
  });

  // Fails: a person with only a family name, as `{ family: "Garcia Perez" }`, is written bare,
  // which BibTeX reads as First "Garcia" and Last "Perez". A part holding the word "and", as in
  // `{ family: "Smith and Wesson", given: "X" }`, splits into two people. Bracing the name keeps
  // it whole but also hides a "van" or "de" from BibTeX's von part, so which to write is left to
  // the maintainers. BibTeX 0.99d was run on both to confirm the reading.
  it.fails("writes each person so BibTeX reads one person, with the whole family name as the last name", () => {
    fc.assert(
      fc.property(fc.array(person, { maxLength: 3 }), (people) => {
        const expected = people.flatMap((one) => expectedVonAndLast(one) ?? []);
        const list = crossrefNameList(people);
        expect(list === undefined ? [] : bibtexNames(list).map(vonAndLast)).toEqual(expected);
      }),
      { examples: [[[{ family: "Garcia Perez" }]]] },
    );
  });
});
