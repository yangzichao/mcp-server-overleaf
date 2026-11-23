import { describe, expect, it } from "vitest";

import {
  REAL_CLOCK,
  type RequestClock,
  sharedSpacedRequests,
  spacedRequests,
} from "../../src/citations/metadataServices/requestSpacing.js";

function stillClock(): RequestClock & { waits: number[] } {
  const waits: number[] = [];
  return {
    waits,
    now: () => 0,
    sleep: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  };
}

describe("spacedRequests", () => {
  it("queues calls made at the same moment one interval apart", async () => {
    const clock = stillClock();
    const spaced = spacedRequests(3_000, clock);
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((call) => spaced(() => Promise.resolve(order.push(call)))));
    expect(clock.waits).toEqual([3_000, 6_000]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("shares one queue per service with the real clock, and gives a test clock its own", () => {
    expect(sharedSpacedRequests("arXiv", 3_000, REAL_CLOCK)).toBe(
      sharedSpacedRequests("arXiv", 3_000, REAL_CLOCK),
    );
    expect(sharedSpacedRequests("arXiv", 3_000, REAL_CLOCK)).not.toBe(
      sharedSpacedRequests("Crossref", 3_000, REAL_CLOCK),
    );
    const clock = stillClock();
    expect(sharedSpacedRequests("arXiv", 3_000, clock)).not.toBe(sharedSpacedRequests("arXiv", 3_000, clock));
  });
});
