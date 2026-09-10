import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPackageContents } from "./packageContents.mjs";
import { createRuntimeSbom } from "./runtimeSbom.mjs";
import { restoreDevelopmentShrinkwrap } from "./shrinkwrap/developmentShrinkwrapSwap.mjs";
import { countDevelopmentEntries } from "./shrinkwrap/pruneDevelopmentEntries.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "overleaf-package-check-"));
const consumerDirectory = join(temporaryDirectory, "consumer with spaces");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

function npm(argumentsValue, cwd = packageRoot) {
  return execFileSync(npmCommand, argumentsValue, { cwd, encoding: "utf8", timeout: 180_000 });
}

try {
  mkdirSync(consumerDirectory);
  writeFileSync(
    join(consumerDirectory, "package.json"),
    JSON.stringify({ name: "overleaf-package-verification", version: "0.0.0", private: true }),
  );
  // prepack always removes dist before compiling; the second build must produce identical bytes.
  const firstPack = JSON.parse(npm(["pack", "--json", "--pack-destination", temporaryDirectory]))[0];
  verifyPackageContents(firstPack);
  const archivePath = join(temporaryDirectory, firstPack.filename);
  const firstArchive = readFileSync(archivePath);
  const secondPack = JSON.parse(npm(["pack", "--json", "--pack-destination", temporaryDirectory]))[0];
  assert.equal(firstPack.integrity, secondPack.integrity, "Repeated package builds must be identical");
  assert.deepEqual(firstArchive, readFileSync(archivePath));
  process.stdout.write(
    `Verified ${firstPack.entryCount} allowlisted files and reproducible package bytes.\n`,
  );

  // No --omit=dev, because a user does not pass it. npm resolves a local archive's
  // dependencies itself instead of from the archive's shrinkwrap, so this tree is the newest
  // resolution of the declared ranges and proves the server runs on it. What a registry
  // install actually builds is decided by the shipped shrinkwrap, checked next.
  npm(["install", "--ignore-scripts", "--no-fund", "--no-audit", archivePath], consumerDirectory);
  const installedRoot = join(consumerDirectory, "node_modules", packageMetadata.name);
  const installedMetadata = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8"));
  assert.equal(installedMetadata.version, packageMetadata.version);
  assert.ok(!installedMetadata.private);
  // The guard that matters. npm builds a registry dependency's subtree from this file, and
  // a development entry in it puts the compiler, the linter and the test runner on every
  // user's machine: 1.4 GB and a first npx run slow enough to time out an MCP client.
  assert.equal(
    countDevelopmentEntries(JSON.parse(readFileSync(join(installedRoot, "npm-shrinkwrap.json"), "utf8"))),
    0,
    "The published shrinkwrap still describes development dependencies",
  );
  for (const developmentDependency of Object.keys(packageMetadata.devDependencies)) {
    for (const treeRoot of [installedRoot, consumerDirectory]) {
      assert.ok(
        !existsSync(join(treeRoot, "node_modules", developmentDependency)),
        `A default install pulled in the development dependency ${developmentDependency}`,
      );
    }
  }
  const version = npm(
    ["exec", "--offline", "--", packageMetadata.name, "--version"],
    consumerDirectory,
  ).trim();
  assert.equal(version, packageMetadata.version, "The npm bin must run without a build or credentials");
  assert.match(
    npm(["exec", "--offline", "--", packageMetadata.name, "--help"], consumerDirectory),
    /OVERLEAF_MCP_ENV_FILE/,
  );

  execFileSync(
    process.execPath,
    [join(packageRoot, "node_modules/vitest/vitest.mjs"), "run", "tests/integration"],
    {
      cwd: packageRoot,
      stdio: "inherit",
      timeout: 240_000,
      env: {
        ...process.env,
        OVERLEAF_TEST_SERVER_ENTRYPOINT: join(installedRoot, "dist/index.js"),
        OVERLEAF_TEST_SERVER_CWD: consumerDirectory,
      },
    },
  );
  process.stdout.write(npm(["audit", "--audit-level=low"], consumerDirectory));
  const sbom = createRuntimeSbom(
    JSON.parse(npm(["sbom", "--sbom-format=cyclonedx", "--omit=dev"], consumerDirectory)),
    packageMetadata,
    JSON.parse(readFileSync(join(packageRoot, "npm-shrinkwrap.json"), "utf8")),
  );
  // Rebuilt from nothing on every run. Copying into whatever happened to be there left
  // one tarball per version piling up, and the release candidate CI uploads is this whole
  // directory, so a stale archive would travel alongside the one that was actually tested.
  const artifactDirectory = join(packageRoot, "release-artifacts");
  rmSync(artifactDirectory, { recursive: true, force: true });
  mkdirSync(artifactDirectory, { recursive: true });
  copyFileSync(archivePath, join(artifactDirectory, firstPack.filename));
  writeFileSync(join(artifactDirectory, "package-manifest.json"), `${JSON.stringify(firstPack, null, 2)}\n`);
  writeFileSync(join(artifactDirectory, "sbom.cdx.json"), `${JSON.stringify(sbom, null, 2)}\n`);
  process.stdout.write(
    `Package installation, CLI, both MCP transports, and installed dependencies passed.\nArtifact: release-artifacts/${firstPack.filename}\n`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
  // npm skips postpack when a pack fails, so close that window here as well.
  restoreDevelopmentShrinkwrap();
}
