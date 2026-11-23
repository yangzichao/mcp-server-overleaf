/**
 * Keeps requests to one public service a set interval apart, as arXiv (three seconds) and
 * Crossref ask. The clock is injectable so tests can check the waits without waiting.
 */

/** arXiv's terms: one request every three seconds, over a single connection. */
export const ARXIV_REQUEST_INTERVAL_MS = 3_000;
/**
 * Crossref's public pool for searches answers with `x-rate-limit-limit: 1` per `1s` and
 * `x-concurrency-limit: 1` (checked 2026-11-22), and a second search within the second gets a
 * 429. The margin covers requests that arrive closer together than they left.
 */
export const CROSSREF_SEARCH_INTERVAL_MS = 1_100;
/**
 * doi.org hands Crossref DOIs to Crossref's pool for single works, which allows five requests
 * a second, one at a time.
 */
export const DOI_RESOLVER_REQUEST_INTERVAL_MS = 250;

export type Sleep = (milliseconds: number) => Promise<void>;

export interface RequestClock {
  readonly sleep: Sleep;
  readonly now: () => number;
}

export const realSleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const REAL_CLOCK: RequestClock = { sleep: realSleep, now: () => Date.now() };

export type SpacedRequests = <T>(call: () => Promise<T>) => Promise<T>;

/**
 * Each call takes the next free start time before it waits, so calls made at the same moment
 * queue up one interval apart instead of all waking together after the first.
 */
export function spacedRequests(intervalMs: number, clock: RequestClock): SpacedRequests {
  let nextStartAt = Number.NEGATIVE_INFINITY;
  return async (call) => {
    const now = clock.now();
    const startAt = Math.max(now, nextStartAt);
    nextStartAt = startAt + intervalMs;
    if (startAt > now) await clock.sleep(startAt - now);
    return call();
  };
}

const sharedByService = new Map<string, SpacedRequests>();

/**
 * One queue per service for the whole process when the real clock is used, so two tools that
 * both call arXiv still keep its interval between them. A test clock gets a queue of its own.
 */
export function sharedSpacedRequests(
  service: string,
  intervalMs: number,
  clock: RequestClock,
): SpacedRequests {
  if (clock !== REAL_CLOCK) return spacedRequests(intervalMs, clock);
  let shared = sharedByService.get(service);
  if (!shared) {
    shared = spacedRequests(intervalMs, clock);
    sharedByService.set(service, shared);
  }
  return shared;
}
