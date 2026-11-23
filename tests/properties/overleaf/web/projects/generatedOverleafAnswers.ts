import fc from "fast-check";

export const overleafId = fc.stringMatching(/^[0-9a-f]{24}$/);

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

export const anyJsonField: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 4 }),
  fc.constant(""),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.string({ maxLength: 2 }), { maxLength: 2 }),
  fc.dictionary(fc.string({ maxLength: 2 }), fc.string({ maxLength: 2 }), { maxKeys: 2 }),
);

export const awkwardText = fc
  .array(fc.constantFrom("Ada", " ", "\t", "\n", "é", "论文", "𝔸", "\uD800", "'", '"', "&", "<", "0"), {
    maxLength: 5,
  })
  .map((pieces) => pieces.join(""));
