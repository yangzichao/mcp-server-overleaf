import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPackageContents } from "./packageContents.mjs";
import { createRuntimeSbom } from "./runtimeSbom.mjs";

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

  npm(
    ["install", "--ignore-scripts", "--omit=dev", "--no-fund", "--no-audit", archivePath],
    consumerDirectory,
  );
  const installedRoot = join(consumerDirectory, "node_modules", packageMetadata.name);
  const installedMetadata = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8"));
  assert.equal(installedMetadata.version, packageMetadata.version);
  assert.ok(!installedMetadata.private);
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
}
