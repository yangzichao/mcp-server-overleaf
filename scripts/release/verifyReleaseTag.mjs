import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const metadata = JSON.parse(readFileSync("package.json", "utf8"));
assert.match(metadata.version, /^\d+\.\d+\.\d+$/, "This workflow only publishes stable version tags");
assert.equal(
  process.env.GITHUB_REF,
  `refs/tags/v${metadata.version}`,
  "Run this workflow on the matching version tag",
);
assert.ok(
  readFileSync("CHANGELOG.md", "utf8").includes(`## ${metadata.version}\n`),
  "Missing changelog entry",
);
execFileSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
process.stdout.write(
  `Release tag, version, changelog, and main ancestry verified for ${metadata.version}.\n`,
);
