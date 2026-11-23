import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { crossrefNameList } from "../../../../../src/citations/find/crossref/crossrefPeople.js";

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

function expectedVonAndLast(written: { family?: string; given?: string; name?: string }): string | undefined {
  return written.family || written.name || written.given || undefined;
}

function withoutBraces(text: string): string {
  return text.replace(/[{}]/g, "");
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

  it("writes each person so BibTeX reads one person, with the whole family name as the last name", () => {
    fc.assert(
      fc.property(fc.array(person, { maxLength: 3 }), (people) => {
        const expected = people.flatMap((one) => expectedVonAndLast(one) ?? []);
        const list = crossrefNameList(people);
        const read =
          list === undefined ? [] : bibtexNames(list).map((name) => withoutBraces(vonAndLast(name)));
        expect(read).toEqual(expected);
      }),
      { examples: [[[{ family: "Garcia Perez" }]]] },
    );
  });
});
