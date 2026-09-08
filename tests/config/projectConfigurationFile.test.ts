import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnvironmentFileIfPresent } from "../../src/config/loadEnvironmentFile.js";
import { loadServerConfigurationFromEnvironment } from "../../src/config/serverConfiguration.js";
import { createToolContext } from "../../src/server/createOverleafMcpServer.js";
import { runToolSafely } from "../../src/tools/toolContext.js";

const paperId = "64a1b2c3d4e5f6a7b8c9d0e1";
const thesisId = "65b2c3d4e5f6a7b8c9d0e1f2";
let directory: string;
let configurationFile: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "overleaf-project-config-"));
  configurationFile = join(directory, "projects with spaces.json");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function loadProjects(projects: unknown, overrides: NodeJS.ProcessEnv = {}) {
  writeFileSync(configurationFile, JSON.stringify({ projects }));
  return loadServerConfigurationFromEnvironment({
    OVERLEAF_PROJECTS_CONFIG: configurationFile,
    ...overrides,
  });
}

describe("portable project credentials", () => {
  it("loads the peers' project schema with independent tokens and the default alias", () => {
    const configuration = loadProjects({
      default: { name: "Main Paper", projectId: paperId, gitToken: "paper-secret" },
      thesis: { projectId: thesisId, gitToken: "thesis-secret" },
    });
    expect(configuration.defaultProjectName).toBe("default");
    expect(configuration.overleafGitToken).toBe("");
    expect(configuration.registeredProjects).toEqual([
      {
        projectName: "default",
        displayName: "Main Paper",
        overleafProjectId: paperId,
        overleafGitToken: "paper-secret",
      },
      { projectName: "thesis", overleafProjectId: thesisId, overleafGitToken: "thesis-secret" },
    ]);
  });

  it("supports token files and a global fallback without overriding a project's token", () => {
    const tokenFile = join(directory, "token with spaces");
    writeFileSync(tokenFile, "file-secret\n", { mode: 0o600 });
    const configuration = loadProjects(
      {
        paper: { projectId: paperId, gitTokenFile: tokenFile },
        thesis: { projectId: thesisId },
      },
      { OVERLEAF_GIT_TOKEN_FILE: tokenFile },
    );
    expect(configuration.overleafGitToken).toBe("file-secret");
    expect(configuration.registeredProjects[0]?.overleafGitToken).toBe("file-secret");
    expect(
      loadProjects(
        { paper: { projectId: paperId, gitToken: "own-secret" } },
        { OVERLEAF_GIT_TOKEN: "global-secret" },
      ).registeredProjects[0]?.overleafGitToken,
    ).toBe("own-secret");
  });

  it("honors environment project selection as a whole and supports the single-project variables", () => {
    const configuration = loadServerConfigurationFromEnvironment({
      OVERLEAF_PROJECTS_CONFIG: "/nonexistent/config.json",
      OVERLEAF_PROJECT_ID: paperId,
      OVERLEAF_PROJECT_NAME: "paper",
      OVERLEAF_GIT_TOKEN: "environment-secret",
    });
    expect(configuration.registeredProjects).toEqual([{ projectName: "paper", overleafProjectId: paperId }]);
  });

  it("discovers only the per-user configuration when no client project configuration is supplied", () => {
    const userDirectory = join(directory, "overleaf-mcp");
    mkdirSync(userDirectory);
    writeFileSync(
      join(userDirectory, "projects.json"),
      JSON.stringify({ projects: { paper: { projectId: paperId, gitToken: "user-secret" } } }),
    );
    expect(loadServerConfigurationFromEnvironment({ XDG_CONFIG_HOME: directory }).defaultProjectName).toBe(
      "paper",
    );
    expect(
      loadServerConfigurationFromEnvironment({
        XDG_CONFIG_HOME: directory,
        OVERLEAF_GIT_TOKEN: "explicit-secret",
      }).registeredProjects,
    ).toEqual([]);
  });

  it.each(["OVERLEAF_PROJECTS_CONFIG", "OVERLEAF_GIT_TOKEN_FILE", "OVERLEAF_PROJECT_ID"])(
    "does not mix the legacy .env when the client sets %s",
    (variable) => {
      const envFile = join(directory, ".env");
      writeFileSync(envFile, "OVERLEAF_GIT_TOKEN=unwanted-secret");
      const environment = { [variable]: "client-value" };
      loadEnvironmentFileIfPresent(environment, envFile);
      expect(environment).toEqual({ [variable]: "client-value" });
    },
  );

  it.each([
    { [thesisId]: { projectId: paperId, gitToken: "private-secret" } },
    { paper: { projectId: "../escape", gitToken: "private-secret" } },
    { paper: { projectId: paperId } },
    { paper: { projectId: paperId, gitTokenFile: "./relative" } },
    { paper: { projectId: paperId, gitToken: "private-secret\nanother-line" } },
    { paper: { projectId: paperId, typo: "private-secret" } },
    {
      paper: { projectId: paperId, gitToken: "private-secret" },
      alias: { projectId: paperId, gitToken: "different-secret" },
    },
  ])("refuses invalid or ambiguous credential configurations without echoing secrets", (projects) => {
    expect(() => loadProjects(projects)).toThrow();
    try {
      loadProjects(projects);
    } catch (error) {
      expect(String(error)).not.toContain("private-secret");
    }
  });

  it("redacts every project's credential from tool errors", async () => {
    const configuration = loadProjects({
      paper: { projectId: paperId, gitToken: "paper-secret" },
      thesis: { projectId: thesisId, gitToken: "thesis-secret" },
    });
    const result = await runToolSafely(createToolContext(configuration), () => {
      throw new Error("paper-secret thesis-secret");
    });
    expect(JSON.stringify(result)).not.toContain("paper-secret");
    expect(JSON.stringify(result)).not.toContain("thesis-secret");
    expect(result.isError).toBe(true);
  });
});
