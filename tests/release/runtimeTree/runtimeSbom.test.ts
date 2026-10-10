import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { createRuntimeSbom } from "../../../scripts/release/runtimeTree/runtimeSbom.mjs";

const packageMetadata = { name: "mcp-server-overleaf", version: "0.3.4" };

const shrinkwrap = {
  packages: {
    "": { name: "mcp-server-overleaf", version: "0.3.4" },
    "node_modules/hono": { version: "4.13.8", peer: true },
    "node_modules/zod": { version: "4.6.5" },
    "node_modules/vitest": { version: "5.0.0", dev: true },
  },
};

/** What `npm sbom` reports for the throwaway consumer directory the package check installs into. */
function consumerSbom(honoVersion: string, zodVersion = "4.6.5") {
  return {
    bomFormat: "CycloneDX",
    metadata: {
      component: { "bom-ref": "overleaf-package-verification@0.0.0", name: "overleaf-package-verification" },
    },
    components: [
      {
        "bom-ref": "mcp-server-overleaf@0.3.4",
        name: "mcp-server-overleaf",
        version: "0.3.4",
        externalReferences: [
          { type: "distribution", url: "file:/tmp/overleaf-package-check/mcp-server-overleaf-0.3.4.tgz" },
          { type: "website", url: "https://github.com/yangzichao/mcp-server-overleaf#readme" },
        ],
      },
      { "bom-ref": `hono@${honoVersion}`, name: "hono", version: honoVersion },
      { "bom-ref": `zod@${zodVersion}`, name: "zod", version: zodVersion },
    ],
    dependencies: [
      { ref: "overleaf-package-verification@0.0.0", dependsOn: ["mcp-server-overleaf@0.3.4"] },
      { ref: "mcp-server-overleaf@0.3.4", dependsOn: [`hono@${honoVersion}`, `zod@${zodVersion}`] },
    ],
  };
}

describe("the runtime SBOM shipped beside a release candidate", () => {
  it("describes the application rather than the throwaway directory it was installed into", () => {
    const { sbom } = createRuntimeSbom(consumerSbom("4.13.8"), packageMetadata, shrinkwrap);
    expect(sbom.metadata.component).toMatchObject({ name: "mcp-server-overleaf", type: "application" });
    expect(sbom.metadata.component.externalReferences).toEqual([
      { type: "website", url: "https://github.com/yangzichao/mcp-server-overleaf#readme" },
    ]);
    expect(sbom.components.map((component: { name: string }) => component.name)).toEqual(["hono", "zod"]);
    expect(sbom.dependencies.map((dependency: { ref: string }) => dependency.ref)).toEqual([
      "mcp-server-overleaf@0.3.4",
    ]);
  });

  it("hands back the comparison, so the package check can print a lock that has drifted", () => {
    const { comparison } = createRuntimeSbom(consumerSbom("4.13.9"), packageMetadata, shrinkwrap);
    expect(comparison.driftWithinMajor).toEqual([
      { name: "hono", installed: ["4.13.9"], locked: ["4.13.8"] },
    ]);
  });

  it("refuses a tree a major version apart, and names the drift alongside it", () => {
    expect(() => createRuntimeSbom(consumerSbom("5.0.0", "4.7.0"), packageMetadata, shrinkwrap)).toThrow(
      /hono resolves to 5\.0\.0[\s\S]*zod 4\.6\.5 to 4\.7\.0/,
    );
  });
});
