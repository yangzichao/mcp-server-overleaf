import { pruneDevelopmentEntries } from "../shrinkwrap/pruneDevelopmentEntries.mjs";

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
 * the dependency graph changed shape. A major version apart — or a minor, for a 0.x package,
 * which semver treats the same way — means a range somewhere now admits a release the pinned
 * tree was never tested against. An unpinned peer dependency can do this without any direct
 * dependency changing. A patch or minor difference is neither; it is a lock that has fallen
 * behind, which `npm update` brings level. Dependabot does not: its npm version updates only
 * bump dependencies this package names, and the packages that drift most are transitive.
 *
 * One name can appear more than once, when npm nests a second copy under the dependency that
 * needs a different version, so every comparison here is over all of a name's versions.
 * Keeping one version per name let a newly nested major hide behind the hoisted copy.
 *
 * Requiring every version to match instead turned each upstream patch release into a red
 * check on branches that had not touched a dependency, with the same unrelated `npm update`
 * as the fix every time.
 */

/** The part of a version a compatible release keeps, read the way a caret range reads it. */
function compatibilityLineOf(version) {
  const [major, minor, patch] = version.split(".");
  if (major !== "0") return major;
  if (minor !== "0") return `0.${minor}`;
  return `0.0.${patch}`;
}

function compatibilityLinesOf(versions) {
  return [...new Set(versions.map(compatibilityLineOf))].sort().join();
}

function compareNames(left, right) {
  return left.localeCompare(right);
}

function compareVersions(left, right) {
  return left.localeCompare(right, "en", { numeric: true });
}

function groupVersionsByName(namedVersions) {
  const versionsByName = new Map();
  for (const [name, version] of namedVersions) {
    versionsByName.set(name, (versionsByName.get(name) ?? new Set()).add(version));
  }
  return new Map([...versionsByName].map(([name, versions]) => [name, [...versions].sort(compareVersions)]));
}

/** Every version of each runtime package, as the CycloneDX components of the consumer install report them. */
export function readInstalledRuntimeVersions(components) {
  return groupVersionsByName(components.map((component) => [component.name, component.version]));
}

/** Every version of each runtime package the shipped shrinkwrap pins. */
export function readLockedRuntimeVersions(shrinkwrap) {
  return groupVersionsByName(
    Object.entries(pruneDevelopmentEntries(shrinkwrap).packages)
      .filter(([path]) => path)
      .map(([path, information]) => [
        information.name ?? path.split("node_modules/").at(-1),
        information.version,
      ]),
  );
}

export function compareRuntimeDependencies(installed, locked) {
  const majorVersionChanges = [];
  const driftWithinMajor = [];
  for (const name of [...installed.keys()].sort(compareNames)) {
    const installedVersions = installed.get(name);
    const lockedVersions = locked.get(name);
    if (!lockedVersions || installedVersions.join() === lockedVersions.join()) continue;
    const difference = { name, installed: installedVersions, locked: lockedVersions };
    if (compatibilityLinesOf(installedVersions) === compatibilityLinesOf(lockedVersions)) {
      driftWithinMajor.push(difference);
    } else {
      majorVersionChanges.push(difference);
    }
  }

  return {
    onlyInstalled: [...installed.keys()].filter((name) => !locked.has(name)).sort(compareNames),
    onlyLocked: [...locked.keys()].filter((name) => !installed.has(name)).sort(compareNames),
    majorVersionChanges,
    driftWithinMajor,
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
      `${change.name} resolves to ${change.installed.join(" and ")}, a breaking change under semver from the pinned ${change.locked.join(" and ")}. ` +
        "Pin it as a direct dependency if an unpinned peer range let this through.",
    );
  }
  return problems;
}

/** What to print when the lock has merely drifted. Empty string when the two trees agree. */
export function describeRuntimeVersionDrift(comparison) {
  if (comparison.driftWithinMajor.length === 0) return "";
  const entries = comparison.driftWithinMajor.map(
    (difference) =>
      `${difference.name} ${difference.locked.join(" and ")} to ${difference.installed.join(" and ")}`,
  );
  return `The shrinkwrap differs from the newest resolution within the same major versions, which \`npm update\` brings level: ${entries.join(", ")}.\n`;
}
