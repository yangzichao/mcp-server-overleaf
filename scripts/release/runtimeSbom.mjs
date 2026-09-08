import assert from "node:assert/strict";

export function createRuntimeSbom(consumerSbom, metadata, shrinkwrap) {
  const application = consumerSbom.components.find(
    (component) => component.name === metadata.name && component.version === metadata.version,
  );
  assert.ok(application, "Installed application is missing from the SBOM");
  const wrapperReference = consumerSbom.metadata.component["bom-ref"];
  const components = consumerSbom.components.filter((component) => component !== application);
  const installedVersions = components.map((component) => `${component.name}@${component.version}`).sort();
  const lockedVersions = Object.entries(shrinkwrap.packages)
    .filter(([path, information]) => path && !information.dev)
    .map(
      ([path, information]) =>
        `${information.name ?? path.split("node_modules/").at(-1)}@${information.version}`,
    )
    .sort();
  assert.deepEqual(
    installedVersions,
    lockedVersions,
    "Installed runtime dependencies differ from the shrinkwrap",
  );

  // Remove the verification harness and its temporary archive URL, retaining npm's
  // dependency graph, registry hashes, licenses, and the tested application's hash.
  return {
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
  };
}
