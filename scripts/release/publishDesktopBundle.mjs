import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Publishes the GitHub Release for the tag and attaches the Claude Desktop bundle.
 *
 * Two copies are uploaded on purpose. The versioned name is what someone cites when
 * reporting a problem; the unversioned one keeps
 * `releases/latest/download/mcp-server-overleaf.mcpb` working, which is the link the README
 * hands to people who will never open a terminal.
 */

const packageMetadata = JSON.parse(readFileSync("package.json", "utf8"));
const tagName = `v${packageMetadata.version}`;
assert.equal(process.env.GITHUB_REF, `refs/tags/${tagName}`, "Run this job on the matching version tag");

const buildDirectory = join("build", "mcpb");
const versionedBundle = join(buildDirectory, `${packageMetadata.name}-${packageMetadata.version}.mcpb`);
const stableBundle = join(buildDirectory, `${packageMetadata.name}.mcpb`);
assert.ok(existsSync(versionedBundle), `Expected ${versionedBundle} from the bundle build`);
copyFileSync(versionedBundle, stableBundle);

function releaseNotes() {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const section = new RegExp(`^## ${packageMetadata.version}\\n([\\s\\S]*?)(?=^## |\\Z)`, "m").exec(
    changelog,
  );
  assert.ok(section?.[1], `CHANGELOG.md has no ## ${packageMetadata.version} section`);
  return `${section[1].trim()}\n\nInstall in Claude Desktop by downloading \`${packageMetadata.name}.mcpb\` below and double-clicking it. Everywhere else: \`npx --yes ${packageMetadata.name}@${packageMetadata.version} setup\`.\n`;
}

function gh(argumentsValue) {
  return execFileSync("gh", argumentsValue, { encoding: "utf8", timeout: 300_000 });
}

const alreadyPublished = (() => {
  try {
    gh(["release", "view", tagName]);
    return true;
  } catch {
    return false;
  }
})();

if (alreadyPublished) {
  gh(["release", "upload", tagName, versionedBundle, stableBundle, "--clobber"]);
} else {
  gh([
    "release",
    "create",
    tagName,
    versionedBundle,
    stableBundle,
    "--title",
    `${packageMetadata.name} ${packageMetadata.version}`,
    "--notes",
    releaseNotes(),
  ]);
}

process.stdout.write(`Attached the Claude Desktop bundle to release ${tagName}.\n`);
