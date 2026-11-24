import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../../../../src/config/configurationError.js";
import { selectProjects } from "../../../../src/config/projects/projectSelection.js";
import { projectAddress, projectAlias, writtenProjectId } from "./overleafProjectIds.js";

const registeredProjects = fc
  .uniqueArray(fc.oneof(projectAlias, fc.constant("default")), {
    minLength: 1,
    maxLength: 4,
    selector: (alias) => alias.trim(),
  })
  .chain((aliases) =>
    fc
      .uniqueArray(writtenProjectId, {
        minLength: aliases.length,
        maxLength: aliases.length,
        selector: (projectId) => projectId.toLowerCase(),
      })
      .map((projectIds) =>
        aliases.map((alias, index) => ({ projectName: alias.trim(), projectId: projectIds[index] ?? "" })),
      ),
  );

const chosenDefault = (projectNames: readonly string[]) =>
  fc.option(fc.oneof(fc.constantFrom(...projectNames), fc.constantFrom("default", "elsewhere", " ")), {
    nil: undefined,
  });

function expectedDefault(projectNames: readonly string[], chosen: string | undefined): string | null {
  const explicit = chosen?.trim();
  if (explicit) return explicit;
  if (projectNames.includes("default")) return "default";
  return projectNames.length === 1 ? (projectNames[0] ?? null) : null;
}

const anyEnvironmentText = fc.oneof(
  fc.string({ maxLength: 30 }),
  fc.constantFrom("paper=0123456789abcdef01234567", "0123456789ABCDEF01234567", "default", ",", "="),
);

describe("selectProjects properties", () => {
  it("registers each OVERLEAF_PROJECTS entry and picks the default the documented way, or refuses an unknown one", () => {
    fc.assert(
      fc.property(
        registeredProjects.chain((projects) =>
          fc.tuple(fc.constant(projects), chosenDefault(projects.map((project) => project.projectName))),
        ),
        ([projects, chosen]) => {
          const environment: NodeJS.ProcessEnv = {
            OVERLEAF_PROJECTS: projects
              .map((project) => `${project.projectName}=${project.projectId}`)
              .join(","),
            OVERLEAF_DEFAULT_PROJECT: chosen,
          };
          const projectNames = projects.map((project) => project.projectName);
          const expected = expectedDefault(projectNames, chosen);
          if (expected !== null && !projectNames.includes(expected)) {
            expect(() => selectProjects(environment, "token", false)).toThrow(ConfigurationError);
            return;
          }
          const selection = selectProjects(environment, "token", false);
          expect(selection.registeredProjects).toEqual(
            projects.map((project) => ({
              projectName: project.projectName,
              overleafProjectId: project.projectId.toLowerCase(),
            })),
          );
          expect(selection.defaultProjectName).toBe(expected);
        },
      ),
    );
  });

  it("registers one project from OVERLEAF_PROJECT_ID, given as an id or an address, under OVERLEAF_PROJECT_NAME", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          writtenProjectId.map((projectId) => ({ projectId, written: projectId })),
          projectAddress,
        ),
        fc.option(fc.oneof(projectAlias, fc.constant(" ")), { nil: undefined }),
        ({ projectId, written }, projectName) => {
          const selection = selectProjects(
            { OVERLEAF_PROJECT_ID: written, OVERLEAF_PROJECT_NAME: projectName },
            "token",
            false,
          );
          const expectedName = projectName?.trim() || "default";
          expect(selection.registeredProjects).toEqual([
            { projectName: expectedName, overleafProjectId: projectId.toLowerCase() },
          ]);
          expect(selection.defaultProjectName).toBe(expectedName);
        },
      ),
    );
  });

  it("registers OVERLEAF_PROJECT_ID under a name holding a comma or an equals sign", () => {
    fc.assert(
      fc.property(writtenProjectId, fc.constantFrom("a,b", "a=b", "Draft, v2"), (projectId, projectName) => {
        const selection = selectProjects(
          { OVERLEAF_PROJECT_ID: projectId, OVERLEAF_PROJECT_NAME: projectName },
          "token",
          false,
        );
        expect(selection.registeredProjects).toEqual([
          { projectName, overleafProjectId: projectId.toLowerCase() },
        ]);
      }),
    );
  });

  it("returns a default that is registered, or refuses with a ConfigurationError, for any project variables", () => {
    fc.assert(
      fc.property(
        fc.record({
          OVERLEAF_PROJECTS: fc.option(anyEnvironmentText, { nil: undefined }),
          OVERLEAF_PROJECT_ID: fc.option(fc.oneof(anyEnvironmentText, writtenProjectId), { nil: undefined }),
          OVERLEAF_PROJECT_NAME: fc.option(anyEnvironmentText, { nil: undefined }),
          OVERLEAF_DEFAULT_PROJECT: fc.option(anyEnvironmentText, { nil: undefined }),
        }),
        fc.constantFrom("", "token"),
        fc.boolean(),
        (environment, gitToken, sessionCookieConfigured) => {
          // Without either variable the selection reads the user's projects.json instead.
          fc.pre(Boolean(environment.OVERLEAF_PROJECTS?.trim() || environment.OVERLEAF_PROJECT_ID?.trim()));
          let selection: ReturnType<typeof selectProjects>;
          try {
            selection = selectProjects(environment, gitToken, sessionCookieConfigured);
          } catch (error) {
            expect(error).toBeInstanceOf(ConfigurationError);
            return;
          }
          const projectNames = selection.registeredProjects.map((project) => project.projectName);
          if (selection.defaultProjectName !== null)
            expect(projectNames).toContain(selection.defaultProjectName);
          expect(new Set(projectNames).size).toBe(projectNames.length);
        },
      ),
    );
  });
});
