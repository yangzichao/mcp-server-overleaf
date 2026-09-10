import { describe, expect, it } from "vitest";
import { parseSetupOptions } from "../../src/setup/parseSetupOptions.js";

describe("parseSetupOptions", () => {
  it("defaults to asking interactively and registering as overleaf", () => {
    const options = parseSetupOptions([]);
    expect(options).toMatchObject({
      projects: [],
      serverName: "overleaf",
      clientIds: [],
      readTokenFromStandardInput: false,
      acceptDefaults: false,
    });
  });

  it("collects repeated projects and their optional names", () => {
    const options = parseSetupOptions([
      "--project",
      "https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1",
      "--project",
      "thesis=65b2c3d4e5f6a7b8c9d0e1f2",
    ]);
    expect(options.projects).toEqual([
      { reference: "https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1" },
      { projectName: "thesis", reference: "65b2c3d4e5f6a7b8c9d0e1f2" },
    ]);
  });

  it("splits the client list", () => {
    expect(parseSetupOptions(["--clients", "codex, claude-code"]).clientIds).toEqual([
      "codex",
      "claude-code",
    ]);
  });

  it("refuses a flag with no value", () => {
    expect(() => parseSetupOptions(["--project", "--yes"])).toThrow(/--project needs a value/);
  });

  it("refuses an unknown flag", () => {
    expect(() => parseSetupOptions(["--wat"])).toThrow(/Unknown setup argument/);
  });
});
