import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import * as runtimeDependencyComparison from "../../scripts/release/runtimeDependencyComparison.mjs";

const {
  compareRuntimeDependencies,
  describeRuntimeTreeProblems,
  describeRuntimeVersionDrift,
  readInstalledRuntimeVersions,
  readLockedRuntimeVersions,
} = runtimeDependencyComparison;

/**
 * The package check installs the packed archive the way a user does, which resolves this
 * package's declared ranges freshly against the registry. That tree is newer than the
 * shrinkwrap whenever anything upstream has published since the lock was refreshed, and the
 * point of these rules is to tell that apart from a dependency graph that actually changed.
 */

const lockedTree = {
  packages: {
    "": { name: "mcp-server-overleaf", version: "0.3.4" },
    "node_modules/hono": { version: "4.13.8", peer: true },
    "node_modules/typescript": { version: "7.0.2", dev: true },
    "node_modules/zod": { name: "zod", version: "4.6.5" },
  },
};

function compare(installed: Record<string, string>) {
  return compareRuntimeDependencies(
    new Map(Object.entries(installed)),
    readLockedRuntimeVersions(lockedTree),
  );
}

describe("reading the two trees", () => {
  it("takes runtime packages from the shrinkwrap and leaves the root and the dev half out", () => {
    expect([...readLockedRuntimeVersions(lockedTree)]).toEqual([
      ["hono", "4.13.8"],
      ["zod", "4.6.5"],
    ]);
  });

  it("names a package after its path when the shrinkwrap entry carries no name", () => {
    expect(readLockedRuntimeVersions(lockedTree).get("hono")).toBe("4.13.8");
  });

  it("reads the installed tree from the CycloneDX components of the consumer install", () => {
    const components = [
      { name: "zod", version: "4.6.5" },
      { name: "hono", version: "4.13.9" },
    ];
    expect([...readInstalledRuntimeVersions(components)]).toEqual([
      ["zod", "4.6.5"],
      ["hono", "4.13.9"],
    ]);
  });
});

describe("a lock that has merely fallen behind", () => {
  const comparison = compare({ hono: "4.13.9", zod: "4.6.5" });

  // The whole reason this file exists. An upstream patch release used to fail the package
  // check on branches that had not touched a dependency.
  it("is not a problem, because both trees are tested and Dependabot closes the gap", () => {
    expect(describeRuntimeTreeProblems(comparison)).toEqual([]);
  });

  it("is still reported, so the gap is visible in the package check output", () => {
    expect(describeRuntimeVersionDrift(comparison)).toContain("hono 4.13.8 to 4.13.9");
  });

  it("says nothing at all when the two trees agree", () => {
    expect(describeRuntimeVersionDrift(compare({ hono: "4.13.8", zod: "4.6.5" }))).toBe("");
  });
});

describe("a tree that genuinely changed shape", () => {
  it("fails when a fresh install pulls in a package the shrinkwrap does not describe", () => {
    const problems = describeRuntimeTreeProblems(compare({ hono: "4.13.8", zod: "4.6.5", ws: "8.21.3" }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("does not describe: ws");
  });

  it("fails when the shrinkwrap describes a package a fresh install does not use", () => {
    const problems = describeRuntimeTreeProblems(compare({ zod: "4.6.5" }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("does not use: hono");
  });

  /**
   * An unpinned peer dependency is the way this happens without any direct dependency
   * changing: nothing in this package names `hono`, so a dependency widening its peer range
   * is enough to put a major version in a user's tree that was never tested here.
   */
  it("fails on a major version apart, and says pinning it directly is the fix", () => {
    const problems = describeRuntimeTreeProblems(compare({ hono: "5.0.0", zod: "4.6.5" }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("hono resolves to 5.0.0");
    expect(problems[0]).toContain("direct dependency");
  });

  it("does not confuse a major change with drift, or report it twice", () => {
    const comparison = compare({ hono: "5.0.0", zod: "4.6.6" });
    expect(comparison.majorVersionChanges.map((change: { name: string }) => change.name)).toEqual(["hono"]);
    expect(comparison.driftWithinMajor.map((change: { name: string }) => change.name)).toEqual(["zod"]);
  });

  it("collects every problem rather than stopping at the first", () => {
    expect(describeRuntimeTreeProblems(compare({ hono: "5.0.0", ws: "8.21.3" }))).toHaveLength(3);
  });
});
