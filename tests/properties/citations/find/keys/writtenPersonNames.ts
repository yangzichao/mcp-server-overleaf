import fc from "fast-check";

/**
 * A person's name in BibTeX's parts: First, von and Last. Every First and Last word starts with
 * an ASCII capital and every von particle with an ASCII lower-case letter, where BibTeX 0.99d
 * and a Unicode reading of case agree on which words are particles.
 */

export interface PersonName {
  readonly first: readonly string[];
  readonly von: readonly string[];
  readonly last: readonly string[];
}

const CAPITALISED = [
  "Maria",
  "Garcia",
  "Perez",
  "Angeles",
  "La",
  "Fontaine",
  "Smith-Jones",
  "O'Brien",
  "Müller",
  "J.",
  "A.-M.",
];
const PARTICLES = ["de", "la", "los", "van", "der", "von", "y", "di", "du", "ten"];

const capitalised = fc.constantFrom(...CAPITALISED);
const particle = fc.constantFrom(...PARTICLES);

/** Particles first and last, and capitalised words may come between them, as in `de los Angeles Garcia y`. */
const vonPart = fc.oneof(
  fc.constant([]),
  fc
    .array(fc.tuple(fc.array(capitalised, { maxLength: 2 }), particle), { minLength: 1, maxLength: 3 })
    .chain((groups) =>
      particle.map((opening) => [opening, ...groups.flatMap(([between, closing]) => [...between, closing])]),
    ),
  particle.map((only) => [only]),
);

/** Without a particle or a comma BibTeX takes only the last word as Last, so a longer Last needs a particle. */
export const personName: fc.Arbitrary<PersonName> = fc
  .record({
    first: fc.array(capitalised, { maxLength: 3 }),
    von: vonPart,
    last: fc.array(capitalised, { minLength: 1, maxLength: 2 }),
  })
  .map((name) => (name.von.length === 0 ? { ...name, last: name.last.slice(-1) } : name));

/** `First von Last`, which needs no comma. */
export function writtenInOrder(name: PersonName): string {
  return [...name.first, ...name.von, ...name.last].join(" ");
}

/** `von Last, First`, for a name with a First. */
export function writtenLastFirst(name: PersonName): string {
  return `${[...name.von, ...name.last].join(" ")}, ${name.first.join(" ")}`;
}
