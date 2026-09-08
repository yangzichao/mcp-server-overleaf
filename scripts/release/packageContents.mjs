import assert from "node:assert/strict";

const rootFiles = new Set([
  "package.json",
  "npm-shrinkwrap.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "SECURITY.md",
  ".env.example",
]);

export function verifyPackageContents(packageInformation) {
  const paths = new Set(packageInformation.files.map((file) => file.path));
  for (const required of [...rootFiles, "dist/index.js", "dist/config/packageMetadata.js"]) {
    assert.ok(paths.has(required), `Missing required package file: ${required}`);
  }
  for (const path of paths) {
    assert.ok(
      rootFiles.has(path) || /^dist\/[A-Za-z0-9/]+\.js$/.test(path) || /^docs\/[a-z0-9-]+\.md$/.test(path),
      `Unexpected published file: ${path}`,
    );
  }
  assert.ok(
    packageInformation.unpackedSize < 500_000,
    "Unexpected package size growth; inspect before release",
  );
}
