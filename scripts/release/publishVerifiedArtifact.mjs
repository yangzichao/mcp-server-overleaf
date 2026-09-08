import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync("release-artifacts/package-manifest.json", "utf8"));
const metadata = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(manifest.name, metadata.name);
assert.equal(manifest.version, metadata.version);
assert.equal(manifest.filename, `${metadata.name}-${metadata.version}.tgz`);
const artifact = join("release-artifacts", manifest.filename);
const integrity = `sha512-${createHash("sha512").update(readFileSync(artifact)).digest("base64")}`;
assert.equal(integrity, manifest.integrity, "Artifact changed after verification");
if (process.env.NPM_BOOTSTRAP === "true") {
  assert.ok(
    process.env.NODE_AUTH_TOKEN,
    "Set the temporary NPM_BOOTSTRAP_TOKEN environment secret for first publish",
  );
}
execFileSync(
  "npm",
  ["publish", `./${artifact}`, "--ignore-scripts", "--access", "public", "--provenance", "--tag", "latest"],
  {
    stdio: "inherit",
    timeout: 180_000,
  },
);
