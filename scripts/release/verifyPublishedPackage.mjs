import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

// npm accepts a publish before its registry serves the version; 0.3.5 took about two minutes
// to appear, past the minute this used to allow.
const registryVisibilityTimeoutMilliseconds = 10 * 60_000;
const registryPollIntervalMilliseconds = 10_000;

// `npm install` does not read the per-version document. It reads the abbreviated packument,
// which the registry caches separately: for 0.3.6 the version document answered while the
// packument still lacked the version, and the install failed with ETARGET. So both must
// list the version before the install runs.
const abbreviatedPackumentMediaType = "application/vnd.npm.install-v1+json";

const manifest = JSON.parse(readFileSync("release-artifacts/package-manifest.json", "utf8"));
const packageUrl = `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}`;

async function fetchRegistryDocument(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (response.ok) return response.json();
  assert.ok(response.status === 404 || response.status >= 500, `Registry returned ${response.status}`);
  return undefined;
}

const registryVisibilityDeadline = Date.now() + registryVisibilityTimeoutMilliseconds;
let publishedMetadata;
while (Date.now() < registryVisibilityDeadline) {
  const versionDocument = await fetchRegistryDocument(`${packageUrl}/${manifest.version}`);
  const installPackument = await fetchRegistryDocument(packageUrl, { accept: abbreviatedPackumentMediaType });
  if (versionDocument && installPackument?.versions?.[manifest.version]) {
    publishedMetadata = versionDocument;
    break;
  }
  await setTimeout(registryPollIntervalMilliseconds);
}
assert.ok(
  publishedMetadata,
  `Published version did not become visible on npm within ${registryVisibilityTimeoutMilliseconds / 60_000} minutes`,
);
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
