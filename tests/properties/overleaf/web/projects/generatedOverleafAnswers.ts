import fc from "fast-check";

/** Ids and JSON values as Overleaf's answers may hold them, and ones it never sends. */

export const overleafId = fc.stringMatching(/^[0-9a-f]{24}$/);

/** Strings `requireOverleafId` must refuse, some close to an id and some that would change a path. */
export const notAnOverleafId = fc.oneof(
  fc.constantFrom(
    "",
    "x",
    "../tag",
    "64b00000000000000000000/",
    "64b000000000000000000002?x=1",
    " 64b000000000000000000002",
  ),
  fc.stringMatching(/^[0-9a-f]{23}$/),
  fc.stringMatching(/^[0-9a-f]{25}$/),
  fc.stringMatching(/^[0-9a-f]{12}[g-z/#%.]{1,3}[0-9a-f]{9}$/),
);

/** Anything JSON could hold where Overleaf sends a string, a flag or a list. */
export const anyJsonField: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 4 }),
  fc.constant(""),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string({ maxLength: 2 }), { maxLength: 2 }),
  fc.dictionary(fc.string({ maxLength: 2 }), fc.string({ maxLength: 2 }), { maxKeys: 2 }),
);

/** Text with the characters a name or a message could hold that are easy to get wrong. */
export const awkwardText = fc
  .array(fc.constantFrom("Ada", " ", "\t", "\n", "é", "论文", "𝔸", "\uD800", "'", '"', "&", "<", "0"), {
    maxLength: 5,
  })
  .map((pieces) => pieces.join(""));
