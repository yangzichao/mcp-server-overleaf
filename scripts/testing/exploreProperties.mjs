import { spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";

// `npm run check` runs the property tests on one fixed seed. This runs them on a new seed
// with many more cases, to find counterexamples the fixed seed never reaches. Rerun a failure
// with the FAST_CHECK_SEED it prints, and keep the counterexample as a unit test.
const seed = process.env.FAST_CHECK_SEED || String(randomInt(2 ** 31));
const runs = process.env.FAST_CHECK_RUNS || "2000";
console.error(`Exploring properties with FAST_CHECK_SEED=${seed} FAST_CHECK_RUNS=${runs}`);

const vitest = spawnSync("npx", ["vitest", "run", "tests/properties", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, FAST_CHECK_SEED: seed, FAST_CHECK_RUNS: runs },
});
process.exit(vitest.status ?? 1);
