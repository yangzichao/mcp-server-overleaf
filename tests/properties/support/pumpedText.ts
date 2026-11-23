import fc from "fast-check";

/**
 * Text made of one short piece repeated to a given length between a short prefix and suffix.
 * It is the shape of the attack strings recheck reports, and the shape that makes a
 * backtracking regular expression slow, so a property over it finds slow patterns that random
 * text misses. A few thousand characters show a cubic pattern; a quadratic one needs tens of
 * thousands to stand out from a slow machine.
 */
export function pumpedText(
  pieces: readonly string[],
  { minimumLength = 300, maximumLength = 3000 } = {},
): fc.Arbitrary<string> {
  const someOf = (minLength: number, maxLength: number) =>
    fc.array(fc.constantFrom(...pieces), { minLength, maxLength }).map((chosen) => chosen.join(""));
  return fc
    .record({
      prefix: someOf(0, 2),
      repeated: someOf(1, 3).filter((repeated) => repeated !== ""),
      length: fc.integer({ min: minimumLength, max: maximumLength }),
      suffix: someOf(0, 2),
    })
    .map(
      ({ prefix, repeated, length, suffix }) =>
        `${prefix}${repeated.repeat(Math.ceil(length / repeated.length))}${suffix}`,
    );
}

/** How long `run` takes, in milliseconds. */
export function millisecondsToRun(run: () => unknown): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}
