import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import * as runtimeDependencyComparison from "../../../scripts/release/runtimeTree/runtimeDependencyComparison.mjs";

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

type NamedVersion = [name: string, version: string];

function installedTree(namedVersions: NamedVersion[]) {
  return readInstalledRuntimeVersions(namedVersions.map(([name, version]) => ({ name, version })));
}

function compare(installed: NamedVersion[], locked: { packages: Record<string, unknown> } = lockedTree) {
  return compareRuntimeDependencies(installedTree(installed), readLockedRuntimeVersions(locked));
}

describe("reading the two trees", () => {
  it("takes runtime packages from the shrinkwrap and leaves the root and the dev half out", () => {
    expect([...readLockedRuntimeVersions(lockedTree)]).toEqual([
      ["hono", ["4.13.8"]],
      ["zod", ["4.6.5"]],
    ]);
  });

  it("names a package after its path when the shrinkwrap entry carries no name", () => {
    expect(readLockedRuntimeVersions(lockedTree).get("hono")).toEqual(["4.13.8"]);
  });

  it("prefers the entry's own name over its path, which differ for an npm alias", () => {
    const aliased = {
      packages: {
        "": { name: "mcp-server-overleaf", version: "0.3.4" },
        "node_modules/string-width-cjs": { name: "string-width", version: "4.2.3" },
      },
    };
    expect([...readLockedRuntimeVersions(aliased)]).toEqual([["string-width", ["4.2.3"]]]);
  });

  it("reads the installed tree from the CycloneDX components of the consumer install", () => {
    expect([
      ...installedTree([
        ["zod", "4.6.5"],
        ["hono", "4.13.9"],
      ]),
    ]).toEqual([
      ["zod", ["4.6.5"]],
      ["hono", ["4.13.9"]],
    ]);
  });

  it("keeps every version of a name that npm nested more than once", () => {
    expect(
      installedTree([
        ["zod", "4.6.5"],
        ["zod", "3.25.76"],
        ["zod", "4.6.5"],
      ]).get("zod"),
    ).toEqual(["3.25.76", "4.6.5"]);
  });
});

describe("a lock that has merely fallen behind", () => {
  const comparison = compare([
    ["hono", "4.13.9"],
    ["zod", "4.6.5"],
  ]);

  // The whole reason this file exists. An upstream patch release used to fail the package
  // check on branches that had not touched a dependency.
  it("is not a problem, because both trees are tested", () => {
    expect(describeRuntimeTreeProblems(comparison)).toEqual([]);
  });

  it("is still reported, with the command that brings the lock level", () => {
    const drift = describeRuntimeVersionDrift(comparison);
    expect(drift).toContain("hono 4.13.8 to 4.13.9");
    expect(drift).toContain("npm update");
  });

  it("says nothing at all when the two trees agree", () => {
    const agreeing = compare([
      ["hono", "4.13.8"],
      ["zod", "4.6.5"],
    ]);
    expect(describeRuntimeVersionDrift(agreeing)).toBe("");
  });

  it("is drift for a 0.x package when only the patch moved", () => {
    const zeroMajorLock = {
      packages: {
        "": { name: "mcp-server-overleaf", version: "0.3.4" },
        "node_modules/tiny": { version: "0.2.7" },
      },
    };
    const comparison = compare([["tiny", "0.2.9"]], zeroMajorLock);
    expect(describeRuntimeTreeProblems(comparison)).toEqual([]);
    expect(describeRuntimeVersionDrift(comparison)).toContain("tiny 0.2.7 to 0.2.9");
  });
});

describe("a tree that genuinely changed shape", () => {
  it("fails when a fresh install pulls in a package the shrinkwrap does not describe", () => {
    const problems = describeRuntimeTreeProblems(
      compare([
        ["hono", "4.13.8"],
        ["zod", "4.6.5"],
        ["ws", "8.21.3"],
      ]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("does not describe: ws");
  });

  it("fails when the shrinkwrap describes a package a fresh install does not use", () => {
    const problems = describeRuntimeTreeProblems(compare([["zod", "4.6.5"]]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("does not use: hono");
  });

  /**
   * An unpinned peer dependency is the way this happens without any direct dependency
   * changing: nothing in this package names `hono`, so a dependency widening its peer range
   * is enough to put a major version in a user's tree that was never tested here.
   */
  it("fails on a major version apart, and says pinning it directly is the fix", () => {
    const problems = describeRuntimeTreeProblems(
      compare([
        ["hono", "5.0.0"],
        ["zod", "4.6.5"],
      ]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("hono resolves to 5.0.0");
    expect(problems[0]).toContain("direct dependency");
  });

  // Under semver, and under every caret range, 0.2 to 0.3 is as breaking as 4 to 5.
  it("fails on a 0.x minor apart, the major of a package that has not reached 1.0", () => {
    const zeroMajorLock = {
      packages: {
        "": { name: "mcp-server-overleaf", version: "0.3.4" },
        "node_modules/tiny": { version: "0.2.7" },
      },
    };
    const problems = describeRuntimeTreeProblems(compare([["tiny", "0.3.0"]], zeroMajorLock));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("tiny resolves to 0.3.0");
  });

  /**
   * npm sbom lists components in tree order, so a copy nested under another dependency can
   * come before the hoisted one. Keeping one version per name kept whichever came last, and
   * the hoisted 4.6.5 hid the new 3.x completely.
   */
  it("fails when a second major appears as a nested copy beside the hoisted one", () => {
    const problems = describeRuntimeTreeProblems(
      compare([
        ["hono", "4.13.8"],
        ["zod", "3.25.76"],
        ["zod", "4.6.5"],
      ]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("zod resolves to 3.25.76 and 4.6.5");
  });

  it("passes when both trees nest the same majors, whatever order each lists them in", () => {
    const nestedLock = {
      packages: {
        "": { name: "mcp-server-overleaf", version: "0.3.4" },
        "node_modules/@modelcontextprotocol/core/node_modules/zod": { version: "3.25.76" },
        "node_modules/zod": { version: "4.6.5" },
      },
    };
    const comparison = compare(
      [
        ["zod", "4.6.6"],
        ["zod", "3.25.76"],
      ],
      nestedLock,
    );
    expect(describeRuntimeTreeProblems(comparison)).toEqual([]);
    expect(describeRuntimeVersionDrift(comparison)).toContain("zod 3.25.76 and 4.6.5 to 3.25.76 and 4.6.6");
  });

  it("does not confuse a major change with drift, or report it twice", () => {
    const comparison = compare([
      ["hono", "5.0.0"],
      ["zod", "4.6.6"],
    ]);
    expect(comparison.majorVersionChanges.map((change: { name: string }) => change.name)).toEqual(["hono"]);
    expect(comparison.driftWithinMajor.map((change: { name: string }) => change.name)).toEqual(["zod"]);
  });

  it("collects every problem rather than stopping at the first", () => {
    expect(
      describeRuntimeTreeProblems(
        compare([
          ["hono", "5.0.0"],
          ["ws", "8.21.3"],
        ]),
      ),
    ).toHaveLength(3);
  });
});
