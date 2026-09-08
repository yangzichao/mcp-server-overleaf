import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

const manifest = JSON.parse(readFileSync("release-artifacts/package-manifest.json", "utf8"));
let publishedMetadata;
for (let attempt = 0; attempt < 12; attempt += 1) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${manifest.version}`,
    {
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.ok) {
    publishedMetadata = await response.json();
    break;
  }
  assert.ok(response.status === 404 || response.status >= 500, `Registry returned ${response.status}`);
  await setTimeout(5_000);
}
assert.ok(publishedMetadata, "Published version did not become visible on npm");
assert.equal(
  publishedMetadata.dist.integrity,
  manifest.integrity,
  "npm bytes differ from the tested artifact",
);
assert.ok(publishedMetadata.dist.attestations?.url, "npm did not record provenance attestations");

const consumerDirectory = mkdtempSync(join(tmpdir(), "overleaf-published-check-"));
try {
  execFileSync("npm", ["install", "--ignore-scripts", "--no-fund", manifest.id], {
    cwd: consumerDirectory,
    stdio: "inherit",
    timeout: 180_000,
  });
  execFileSync("npm", ["audit", "signatures"], {
    cwd: consumerDirectory,
    stdio: "inherit",
    timeout: 180_000,
  });
  const version = execFileSync("npm", ["exec", "--offline", "--", manifest.name, "--version"], {
    cwd: consumerDirectory,
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(version.trim(), manifest.version);
  process.stdout.write(
    `Verified npm integrity, provenance, signatures, and installed command for ${manifest.id}.\n`,
  );
} finally {
  rmSync(consumerDirectory, { recursive: true, force: true });
}
