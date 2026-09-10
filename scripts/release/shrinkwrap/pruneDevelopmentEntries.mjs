import assert from "node:assert/strict";

/**
 * npm builds a dependency's subtree from whatever `npm-shrinkwrap.json` it finds inside the
 * published tarball, and a lock generated in this repository describes the development tree
 * as well. Publishing it unchanged made a plain `npm install mcp-server-overleaf` fetch the
 * compiler, the linter and the test runner alongside the server: 208 packages and 1.4 GB
 * instead of 7 packages and 19 MB, and a first `npx` run slow enough to exceed the startup
 * timeout of an MCP client. Only the runtime tree is usable by a consumer, so only the
 * runtime tree ships.
 */
export function pruneDevelopmentEntries(developmentShrinkwrap) {
  const packages = developmentShrinkwrap.packages;
  assert.ok(packages?.[""], "npm-shrinkwrap.json is missing its root package entry");

  const shippedRootEntry = { ...packages[""] };
  // Every entry this field points at has just been removed, and a root that still declares
  // them describes a tree the file does not contain.
  delete shippedRootEntry.devDependencies;

  const shippedPackages = { "": shippedRootEntry };
  for (const [path, entry] of Object.entries(packages)) {
    if (path !== "" && !entry.dev) shippedPackages[path] = entry;
  }

  return { ...developmentShrinkwrap, packages: shippedPackages };
}

export function countDevelopmentEntries(shrinkwrap) {
  const entries = Object.entries(shrinkwrap.packages ?? {});
  return entries.filter(([path, entry]) => path !== "" && entry.dev).length;
}
