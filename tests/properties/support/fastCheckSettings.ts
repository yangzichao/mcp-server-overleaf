import fc from "fast-check";

/**
 * Property tests run on a fixed seed, so `npm run check` gives the same result on every run
 * and a failure on CI reproduces locally. FAST_CHECK_SEED and FAST_CHECK_RUNS pick another
 * seed and number of cases; `npm run test:properties:explore` sets both to look for new
 * counterexamples. fast-check prints the seed and path of any failure it finds.
 */
const DEFAULT_SEED = 20_261_123;
const DEFAULT_RUNS = 100;

function readIntegerSetting(name: string, fallback: number): number {
  const written = process.env[name];
  if (written === undefined || written === "") return fallback;
  const value = Number(written);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer, received "${written}".`);
  return value;
}

fc.configureGlobal({
  seed: readIntegerSetting("FAST_CHECK_SEED", DEFAULT_SEED),
  numRuns: readIntegerSetting("FAST_CHECK_RUNS", DEFAULT_RUNS),
});
