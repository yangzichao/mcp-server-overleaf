import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type RequestClock,
  spacedRequests,
} from "../../../../src/citations/metadataServices/requestSpacing.js";

/** Calls arriving at the given times on a clock that only moves when told; returns when each one started. */
async function startTimes(intervalMs: number, arrivals: readonly number[]): Promise<number[]> {
  let now = 0;
  let lastWait = 0;
  const clock: RequestClock = {
    now: () => now,
    sleep: (milliseconds) => {
      lastWait = milliseconds;
      return Promise.resolve();
    },
  };
  const spaced = spacedRequests(intervalMs, clock);
  const starts: number[] = [];
  const pending: Promise<number>[] = [];
  arrivals.forEach((arrival, index) => {
    now = arrival;
    lastWait = 0;
    pending.push(spaced(() => Promise.resolve(index)));
    starts.push(arrival + lastWait);
  });
  await Promise.all(pending);
  return starts;
}

const arrivals = fc
  .array(fc.integer({ min: 0, max: 5_000 }), { maxLength: 8 })
  .map((gaps) => gaps.map((_, index) => gaps.slice(0, index + 1).reduce((sum, gap) => sum + gap, 0)));

describe("spacedRequests properties", () => {
  it("starts each call at its arrival or one interval after the call before it, whichever is later", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 4_000 }), arrivals, async (intervalMs, times) => {
        const starts = await startTimes(intervalMs, times);
        let previousStart = Number.NEGATIVE_INFINITY;
        times.forEach((arrival, index) => {
          const expected = Math.max(arrival, previousStart + intervalMs);
          expect(starts[index]).toBe(expected);
          previousStart = expected;
        });
      }),
    );
  });

  it("keeps every two calls at least one interval apart", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 4_000 }), arrivals, async (intervalMs, times) => {
        const starts = await startTimes(intervalMs, times);
        for (let index = 1; index < starts.length; index += 1) {
          expect((starts[index] ?? 0) - (starts[index - 1] ?? 0)).toBeGreaterThanOrEqual(intervalMs);
        }
      }),
    );
  });
});
