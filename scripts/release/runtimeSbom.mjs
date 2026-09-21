import assert from "node:assert/strict";

import {
  compareRuntimeDependencies,
  describeRuntimeTreeProblems,
  readInstalledRuntimeVersions,
  readLockedRuntimeVersions,
} from "./runtimeDependencyComparison.mjs";

/**
 * Shapes the consumer install's CycloneDX report into the SBOM shipped beside a release, and
 * checks the installed tree against the shrinkwrap on the way through.
 *
 * What counts as a mismatch, and why a version difference usually does not, is explained in
 * runtimeDependencyComparison.mjs.
 */
export function createRuntimeSbom(consumerSbom, metadata, shrinkwrap) {
  const application = consumerSbom.components.find(
    (component) => component.name === metadata.name && component.version === metadata.version,
  );
  assert.ok(application, "Installed application is missing from the SBOM");
  const wrapperReference = consumerSbom.metadata.component["bom-ref"];
  const components = consumerSbom.components.filter((component) => component !== application);

  const comparison = compareRuntimeDependencies(
    readInstalledRuntimeVersions(components),
    readLockedRuntimeVersions(shrinkwrap),
  );
  const problems = describeRuntimeTreeProblems(comparison);
  assert.equal(
    problems.length,
    0,
    `Installed runtime dependencies do not match the shrinkwrap.\n${problems.join("\n")}`,
  );

  // Remove the verification harness and its temporary archive URL, retaining npm's
  // dependency graph, registry hashes, licenses, and the tested application's hash.
  return {
    comparison,
    sbom: {
      ...consumerSbom,
      metadata: {
        ...consumerSbom.metadata,
        component: {
          ...application,
          type: "application",
          externalReferences: application.externalReferences.filter(
            (reference) => !reference.url.startsWith("file:"),
          ),
        },
      },
      components,
      dependencies: consumerSbom.dependencies.filter((dependency) => dependency.ref !== wrapperReference),
    },
  };
}
