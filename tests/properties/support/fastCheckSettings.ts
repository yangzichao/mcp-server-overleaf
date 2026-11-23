import fc from "fast-check";

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
