import { spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";

const seed = process.env.FAST_CHECK_SEED || String(randomInt(2 ** 31));
const runs = process.env.FAST_CHECK_RUNS || "2000";
console.error(`Exploring properties with FAST_CHECK_SEED=${seed} FAST_CHECK_RUNS=${runs}`);

const vitest = spawnSync("npx", ["vitest", "run", "tests/properties", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, FAST_CHECK_SEED: seed, FAST_CHECK_RUNS: runs },
});
process.exit(vitest.status ?? 1);
