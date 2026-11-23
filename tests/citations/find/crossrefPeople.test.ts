import { describe, expect, it } from "vitest";

import { crossrefNameList } from "../../../src/citations/find/crossref/crossrefPeople.js";

/** Each expected list was read back with BibTeX 0.99d's format.name$ to confirm one person each. */
describe("crossrefNameList", () => {
  it.each([
    [{ family: "Knuth", given: "Donald E." }, "Knuth, Donald E."],
    [{ family: "Garcia Perez" }, "{Garcia Perez}"],
    [{ family: "de La Fontaine" }, "de La Fontaine"],
    [{ family: "Plato" }, "Plato"],
    [{ family: "Smith and Wesson", given: "X" }, "Smith {and} Wesson, X"],
    [{ family: "Smith AND Wesson" }, "{Smith AND Wesson}"],
    [{ family: "de Smith and Wesson" }, "de Smith {and} Wesson"],
    [{ family: "van Beethoven", given: "Ludwig", suffix: "Jr." }, "van Beethoven, Jr., Ludwig"],
    [{ name: "World Health Organization" }, "{World Health Organization}"],
  ])("writes %j as %s", (person, expected) => {
    expect(crossrefNameList([person])).toBe(expected);
  });

  it("joins people with and", () => {
    expect(crossrefNameList([{ family: "Garcia Perez" }, { family: "Knuth", given: "Donald E." }])).toBe(
      "{Garcia Perez} and Knuth, Donald E.",
    );
  });
});
