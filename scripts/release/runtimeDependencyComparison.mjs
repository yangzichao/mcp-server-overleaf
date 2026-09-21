/**
 * Comparing the tree a user installs today against the tree the shrinkwrap pins.
 *
 * `verifyPackage.mjs` installs the packed archive into an empty directory without
 * `--omit=dev`, the way a user does. npm resolves a local archive's declared ranges against
 * the registry instead of reading the archive's own shrinkwrap, so that tree is always the
 * newest resolution those ranges allow. That is deliberate: it proves the server runs on
 * what somebody installing right now would get.
 *
 * The shrinkwrap describes a different tree — the one `npm ci` builds here, and the one npm
 * builds for a user installing from the registry. Both trees are tested: the shrinkwrap's by
 * the whole suite on every run, the newest resolution's by the integration suite inside the
 * package check. They hold the same packages, and they drift apart on patch versions the
 * moment anything upstream publishes.
 *
 * So only two things are defects. A package that appears in one tree and not the other means
 * the dependency graph changed shape. A major version apart means a range somewhere now
 * admits a release the pinned tree was never tested against — an unpinned peer dependency can
 * do this without any direct dependency changing. A patch or minor difference is neither; it
 * is a lock that has fallen behind, which Dependabot opens a pull request for.
 *
 * Requiring every version to match instead turned each upstream patch release into a red
 * check on branches that had not touched a dependency, with the same unrelated `npm update`
 * as the fix every time.
 */

function majorVersionOf(version) {
  return version.split(".")[0];
}

/** Runtime package versions as the CycloneDX components of the consumer install report them. */
export function readInstalledRuntimeVersions(components) {
  return new Map(components.map((component) => [component.name, component.version]));
}

/** Runtime package versions the shrinkwrap pins, with its development half left out. */
export function readLockedRuntimeVersions(shrinkwrap) {
  return new Map(
    Object.entries(shrinkwrap.packages)
      .filter(([path, information]) => path && !information.dev)
      .map(([path, information]) => [
        information.name ?? path.split("node_modules/").at(-1),
        information.version,
      ]),
  );
}

export function compareRuntimeDependencies(installed, locked) {
  const differences = [...installed]
    .filter(([name, version]) => locked.has(name) && locked.get(name) !== version)
    .map(([name, version]) => ({ name, installed: version, locked: locked.get(name) }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    onlyInstalled: [...installed.keys()].filter((name) => !locked.has(name)).sort(),
    onlyLocked: [...locked.keys()].filter((name) => !installed.has(name)).sort(),
    majorVersionChanges: differences.filter(
      (difference) => majorVersionOf(difference.installed) !== majorVersionOf(difference.locked),
    ),
    driftWithinMajor: differences.filter(
      (difference) => majorVersionOf(difference.installed) === majorVersionOf(difference.locked),
    ),
  };
}

/** The reasons this comparison should fail the package check, one sentence each. Empty means it passes. */
export function describeRuntimeTreeProblems(comparison) {
  const problems = [];
  if (comparison.onlyInstalled.length > 0) {
    problems.push(
      `A fresh install uses runtime packages the shrinkwrap does not describe: ${comparison.onlyInstalled.join(", ")}.`,
    );
  }
  if (comparison.onlyLocked.length > 0) {
    problems.push(
      `The shrinkwrap describes runtime packages a fresh install does not use: ${comparison.onlyLocked.join(", ")}.`,
    );
  }
  for (const change of comparison.majorVersionChanges) {
    problems.push(
      `${change.name} resolves to ${change.installed}, a different major version from the pinned ${change.locked}. ` +
        "Pin it as a direct dependency if an unpinned peer range let this through.",
    );
  }
  return problems;
}

/** What to print when the lock is merely behind. Empty string when the two trees agree. */
export function describeRuntimeVersionDrift(comparison) {
  if (comparison.driftWithinMajor.length === 0) return "";
  const entries = comparison.driftWithinMajor.map(
    (difference) => `${difference.name} ${difference.locked} to ${difference.installed}`,
  );
  return `Newest resolution is ahead of the shrinkwrap, which Dependabot closes: ${entries.join(", ")}.\n`;
}
