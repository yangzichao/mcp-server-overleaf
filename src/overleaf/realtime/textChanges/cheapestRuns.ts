/** Neighbouring items of a row, from `first` to `last`, both included. */
export interface Run<Item> {
  readonly first: Item;
  readonly last: Item;
}

interface CheapestEnding {
  readonly cost: number;
  readonly runStart: number;
}

/**
 * Splits a row of items into runs of neighbours at the least total `costOfRun`, and gives the
 * runs in order with that total. Of two splits that cost the same, the one whose last run is
 * shorter wins, so items are joined only when that costs less.
 */
export function cheapestRuns<Item>(
  items: readonly Item[],
  costOfRun: (run: Run<Item>) => number,
): { readonly runs: Run<Item>[]; readonly cost: number } {
  const runOf = (start: number, end: number): Run<Item> => {
    const first = items[start];
    const last = items[end - 1];
    if (first === undefined || last === undefined) throw new RangeError(`No run from ${start} to ${end}.`);
    return { first, last };
  };

  // cheapest[end] is the cheapest split of items [0, end), and where its last run starts.
  const cheapest: CheapestEnding[] = [{ cost: 0, runStart: 0 }];
  for (let end = 1; end <= items.length; end += 1) {
    let best: CheapestEnding = { cost: Number.POSITIVE_INFINITY, runStart: end - 1 };
    for (let start = end - 1; start >= 0; start -= 1) {
      const cost = (cheapest[start]?.cost ?? 0) + costOfRun(runOf(start, end));
      if (cost < best.cost) best = { cost, runStart: start };
    }
    cheapest.push(best);
  }

  const runs: Run<Item>[] = [];
  for (let end = items.length; end > 0; ) {
    const start = cheapest[end]?.runStart ?? 0;
    runs.push(runOf(start, end));
    end = start;
  }
  return { runs: runs.reverse(), cost: cheapest[items.length]?.cost ?? 0 };
}
