import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { renderServerJson, serverRegistryName } from "../../scripts/registry/renderServerJson.mjs";

const packageMetadata = {
  name: "mcp-server-overleaf",
  mcpName: "io.github.yangzichao/mcp-server-overleaf",
  version: "9.9.9",
  description: "MCP server for Overleaf.",
  homepage: "https://github.com/yangzichao/mcp-server-overleaf#readme",
};

const desktopBundle = {
  downloadUrl: "https://github.com/yangzichao/mcp-server-overleaf/releases/download/v9.9.9/x.mcpb",
  fileSha256: "a".repeat(64),
};

function render(overrides: Record<string, unknown> = {}) {
  return renderServerJson({ packageMetadata, ...overrides });
}

describe("renderServerJson", () => {
  it("names the server under the GitHub namespace the registry authenticates", () => {
    expect(render().name).toBe("io.github.yangzichao/mcp-server-overleaf");
  });

  it("points at the exact npm version being released, run through npx on stdio", () => {
    const [npmPackage] = render().packages;
    expect(npmPackage.registryType).toBe("npm");
    expect(npmPackage.identifier).toBe("mcp-server-overleaf");
    expect(npmPackage.version).toBe("9.9.9");
    expect(npmPackage.runtimeHint).toBe("npx");
    expect(npmPackage.transport).toEqual({ type: "stdio" });
    expect(npmPackage.packageArguments[0].value).toBe("--stdio");
  });

  it("marks the Overleaf token secret and required", () => {
    const token = render().packages[0].environmentVariables.find(
      (variable: { name: string }) => variable.name === "OVERLEAF_GIT_TOKEN",
    );
    expect(token).toMatchObject({ isRequired: true, isSecret: true });
  });

  it("lists the desktop bundle with its hash only when one was built", () => {
    expect(render().packages).toHaveLength(1);
    const withBundle = render({ desktopBundle });
    expect(withBundle.packages).toHaveLength(2);
    expect(withBundle.packages[1]).toMatchObject({
      registryType: "mcpb",
      identifier: desktopBundle.downloadUrl,
      fileSha256: desktopBundle.fileSha256,
    });
  });

  it("refuses a description the registry would reject", () => {
    expect(() => render({ packageMetadata: { ...packageMetadata, description: "x".repeat(101) } })).toThrow(
      /100 characters/,
    );
  });

  it("refuses an mcpName that would fail npm ownership verification", () => {
    expect(() => render({ packageMetadata: { ...packageMetadata, mcpName: "io.github.someone/x" } })).toThrow(
      /npm ownership/,
    );
  });
});

describe("the published package", () => {
  const realMetadata = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  it("carries the mcpName the registry compares against server.json", () => {
    expect(realMetadata.mcpName).toBe(serverRegistryName(realMetadata));
  });

  it("has a description the registry accepts", () => {
    expect(realMetadata.description.length).toBeLessThanOrEqual(100);
  });
});
