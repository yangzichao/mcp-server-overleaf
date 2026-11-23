import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { cheapestRuns, type Run } from "../../../../../src/overleaf/realtime/textChanges/cheapestRuns.js";

/** Every way to cut a row of `count` items into runs of neighbours, as each run's first and last index. */
function everySplit(count: number): Run<number>[][] {
  if (count === 0) return [[]];
  const splits: Run<number>[][] = [];
  for (let cuts = 0; cuts < 2 ** (count - 1); cuts += 1) {
    const runs: Run<number>[] = [];
    let first = 0;
    for (let index = 0; index < count; index += 1) {
      if (index === count - 1 || (cuts >> index) & 1) {
        runs.push({ first, last: index });
        first = index + 1;
      }
    }
    splits.push(runs);
  }
  return splits;
}

describe("cheapestRuns properties", () => {
  it("finds a split that costs no more than any other, and splits every item into exactly one run", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 0, max: 7 })
          .chain((count) =>
            fc.tuple(
              fc.constant(count),
              fc.array(fc.nat(20), { minLength: count * count, maxLength: count * count }),
            ),
          ),
        ([count, costs]) => {
          const items = Array.from({ length: count }, (_, index) => index);
          const costOfRun = ({ first, last }: Run<number>) => costs[first * count + last] ?? 0;
          const { runs, cost } = cheapestRuns(items, costOfRun);

          expect(runs.flatMap(({ first, last }) => items.slice(first, last + 1))).toEqual(items);
          expect(runs.reduce((total, run) => total + costOfRun(run), 0)).toBe(cost);
          for (const split of everySplit(count)) {
            expect(cost).toBeLessThanOrEqual(split.reduce((total, run) => total + costOfRun(run), 0));
          }
        },
      ),
    );
  });

  it("keeps every item in a run of its own when joining them costs the same", () => {
    const { runs } = cheapestRuns(["a", "b", "c"], ({ first, last }) => (first === last ? 1 : 3));
    expect(runs).toEqual([
      { first: "a", last: "a" },
      { first: "b", last: "b" },
      { first: "c", last: "c" },
    ]);
  });
});
