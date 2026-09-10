import { homedir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ConfigurationError,
  loadServerConfigurationFromEnvironment,
  looksLikeOverleafProjectId,
} from "../../src/config/serverConfiguration.js";

const paperId = "64a1b2c3d4e5f6a7b8c9d0e1";
const thesisId = "65b2c3d4e5f6a7b8c9d0e1f2";

/** A minimal valid environment, so each test can vary one thing. */
function environmentWith(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { OVERLEAF_GIT_TOKEN: "olp_test", OVERLEAF_PROJECTS: `paper=${paperId}`, ...overrides };
}

describe("looksLikeOverleafProjectId", () => {
  it("accepts a 24-character hex id", () => {
    expect(looksLikeOverleafProjectId(paperId)).toBe(true);
  });

  it("accepts it in upper case and with surrounding whitespace", () => {
    expect(looksLikeOverleafProjectId(`  ${paperId.toUpperCase()}  `)).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(looksLikeOverleafProjectId("64a1b2c3")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(looksLikeOverleafProjectId("zzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });

  it("rejects a registered name", () => {
    expect(looksLikeOverleafProjectId("paper")).toBe(false);
  });
});

describe("required configuration", () => {
  it("refuses to start without a token", () => {
    expect(() => loadServerConfigurationFromEnvironment({ OVERLEAF_PROJECTS: `paper=${paperId}` })).toThrow(
      ConfigurationError,
    );
  });

  it("refuses a token that is only whitespace", () => {
    expect(() =>
      loadServerConfigurationFromEnvironment(environmentWith({ OVERLEAF_GIT_TOKEN: "  " })),
    ).toThrow(ConfigurationError);
  });
});

describe("OVERLEAF_PROJECTS parsing", () => {
  it("reads name=id pairs", () => {
    const configuration = loadServerConfigurationFromEnvironment(
      environmentWith({ OVERLEAF_PROJECTS: `paper=${paperId},thesis=${thesisId}` }),
    );
    expect(configuration.registeredProjects).toEqual([
      { projectName: "paper", overleafProjectId: paperId },
      { projectName: "thesis", overleafProjectId: thesisId },
    ]);
  });

  it("tolerates whitespace around entries", () => {
    const configuration = loadServerConfigurationFromEnvironment(
      environmentWith({ OVERLEAF_PROJECTS: ` paper = ${paperId} , thesis = ${thesisId} ` }),
    );
    expect(configuration.registeredProjects.map((p) => p.projectName)).toEqual(["paper", "thesis"]);
  });

  it("registers a bare project id under its own id", () => {
    const configuration = loadServerConfigurationFromEnvironment(
      environmentWith({ OVERLEAF_PROJECTS: paperId }),
    );
    expect(configuration.registeredProjects).toEqual([{ projectName: paperId, overleafProjectId: paperId }]);
  });

  it("rejects a bare entry that is not a project id", () => {
    expect(() =>
      loadServerConfigurationFromEnvironment(environmentWith({ OVERLEAF_PROJECTS: "just-a-name" })),
    ).toThrow(/neither "name=projectId"/);
  });

  it("rejects an entry missing the name", () => {
    expect(() =>
      loadServerConfigurationFromEnvironment(environmentWith({ OVERLEAF_PROJECTS: `=${paperId}` })),
    ).toThrow(/missing a name or a project id/);
  });

  it("rejects an entry missing the id", () => {
    expect(() =>
      loadServerConfigurationFromEnvironment(environmentWith({ OVERLEAF_PROJECTS: "paper=" })),
    ).toThrow(/missing a name or a project id/);
  });
});

describe("the default project", () => {
  it("is the only registered project when there is exactly one", () => {
    expect(loadServerConfigurationFromEnvironment(environmentWith()).defaultProjectName).toBe("paper");
  });

  it("is null when several are registered and none is named", () => {
    const configuration = loadServerConfigurationFromEnvironment(
      environmentWith({ OVERLEAF_PROJECTS: `paper=${paperId},thesis=${thesisId}` }),
    );
    expect(configuration.defaultProjectName).toBeNull();
  });

  it("honours an explicit choice", () => {
    const configuration = loadServerConfigurationFromEnvironment(
      environmentWith({
        OVERLEAF_PROJECTS: `paper=${paperId},thesis=${thesisId}`,
        OVERLEAF_DEFAULT_PROJECT: "thesis",
      }),
    );
    expect(configuration.defaultProjectName).toBe("thesis");
  });

  it("refuses a default that is not registered", () => {
    expect(() =>
      loadServerConfigurationFromEnvironment(environmentWith({ OVERLEAF_DEFAULT_PROJECT: "missing" })),
    ).toThrow(/not present in OVERLEAF_PROJECTS/);
  });
});

describe("optional settings", () => {
  it("defaults the workspace to a directory under home", () => {
    expect(loadServerConfigurationFromEnvironment(environmentWith()).workspaceDirectory).toBe(
      resolve(homedir(), ".overleaf-mcp", "projects"),
    );
  });

  it("resolves a configured workspace to an absolute path", () => {
    const configuration = loadServerConfigurationFromEnvironment(
      environmentWith({ OVERLEAF_MCP_WORKSPACE_DIR: "/tmp/clones" }),
    );
    expect(configuration.workspaceDirectory).toBe("/tmp/clones");
  });

  it("strips a trailing slash from the git base url", () => {
    const configuration = loadServerConfigurationFromEnvironment(
      environmentWith({ OVERLEAF_GIT_BASE_URL: "https://git.example.com///" }),
    );
    expect(configuration.overleafGitBaseUrl).toBe("https://git.example.com");
  });

  it("rejects a non-positive compile timeout", () => {
    expect(() =>
      loadServerConfigurationFromEnvironment(environmentWith({ OVERLEAF_MCP_COMPILE_TIMEOUT_MS: "0" })),
    ).toThrow(/positive integer/);
  });

  it("rejects a non-numeric compile timeout", () => {
    expect(() =>
      loadServerConfigurationFromEnvironment(environmentWith({ OVERLEAF_MCP_COMPILE_TIMEOUT_MS: "soon" })),
    ).toThrow(/positive integer/);
  });
});

describe("OVERLEAF_PROJECT_ID", () => {
  it("accepts a bare project id", () => {
    const configuration = loadServerConfigurationFromEnvironment({
      OVERLEAF_GIT_TOKEN: "olp_test",
      OVERLEAF_PROJECT_ID: paperId,
    });
    expect(configuration.registeredProjects).toEqual([
      { projectName: "default", overleafProjectId: paperId },
    ]);
  });

  it("accepts the address bar URL, which is what a desktop install panel can ask for", () => {
    const configuration = loadServerConfigurationFromEnvironment({
      OVERLEAF_GIT_TOKEN: "olp_test",
      OVERLEAF_PROJECT_ID: `https://www.overleaf.com/project/${paperId.toUpperCase()}?foo=1`,
      OVERLEAF_PROJECT_NAME: "paper",
    });
    expect(configuration.registeredProjects).toEqual([{ projectName: "paper", overleafProjectId: paperId }]);
    expect(configuration.defaultProjectName).toBe("paper");
  });

  it("names the variable when the value holds no project id", () => {
    expect(() =>
      loadServerConfigurationFromEnvironment({
        OVERLEAF_GIT_TOKEN: "olp_test",
        OVERLEAF_PROJECT_ID: "https://www.overleaf.com/read/abcdefghijkl",
      }),
    ).toThrow(ConfigurationError);
  });
});
