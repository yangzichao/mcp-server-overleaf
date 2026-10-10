import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptedAdvisories } from "./acceptedAdvisories.mjs";
import { reviewAuditReport } from "./reviewAuditReport.mjs";

/**
 * `npm audit --audit-level=low` over the whole repository, development tree included, except
 * for the advisories accepted in acceptedAdvisories.mjs.
 *
 * npm has no way to accept a single advisory, so a dev-only advisory with no fixed release
 * would hold every branch red until upstream ships one. This keeps the gate at any severity
 * and lets through exactly the listed advisories, until their review dates.
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

// npm audit exits non-zero whenever it finds anything, so the exit status says nothing here.
const audit = spawnSync(npmCommand, ["audit", "--json"], {
  cwd: packageRoot,
  encoding: "utf8",
  timeout: 180_000,
});
if (audit.error || !audit.stdout) {
  throw new Error(`npm audit did not produce a report: ${audit.error?.message ?? audit.stderr}`);
}

const { failures, notes } = reviewAuditReport(
  JSON.parse(audit.stdout),
  acceptedAdvisories,
  new Date().toISOString().slice(0, 10),
);
for (const note of notes) process.stdout.write(`${note}\n`);
if (failures.length > 0) {
  process.stderr.write(`Dependency audit failed:\n${failures.map((failure) => `  ${failure}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Dependency audit passed.\n");
