export interface Run<Item> {
  readonly first: Item;
  readonly last: Item;
}

interface CheapestPrefixSplit {
  readonly cost: number;
  readonly lastRunStart: number;
}

function costsLessOrAsLittleWithAShorterLastRun(
  candidate: CheapestPrefixSplit,
  best: CheapestPrefixSplit,
): boolean {
  return (
    candidate.cost < best.cost || (candidate.cost === best.cost && candidate.lastRunStart > best.lastRunStart)
  );
}

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

  const cheapestSplitOfEachPrefix: CheapestPrefixSplit[] = [{ cost: 0, lastRunStart: 0 }];
  for (let end = 1; end <= items.length; end += 1) {
    let best: CheapestPrefixSplit = { cost: Number.POSITIVE_INFINITY, lastRunStart: end - 1 };
    for (let start = 0; start < end; start += 1) {
      const candidate = {
        cost: (cheapestSplitOfEachPrefix[start]?.cost ?? 0) + costOfRun(runOf(start, end)),
        lastRunStart: start,
      };
      if (costsLessOrAsLittleWithAShorterLastRun(candidate, best)) best = candidate;
    }
    cheapestSplitOfEachPrefix.push(best);
  }

  const runs: Run<Item>[] = [];
  for (let end = items.length; end > 0; ) {
    const start = cheapestSplitOfEachPrefix[end]?.lastRunStart ?? 0;
    runs.push(runOf(start, end));
    end = start;
  }
  return { runs: runs.reverse(), cost: cheapestSplitOfEachPrefix[items.length]?.cost ?? 0 };
}
