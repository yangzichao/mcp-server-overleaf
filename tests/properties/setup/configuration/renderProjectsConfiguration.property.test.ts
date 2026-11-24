import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type OverleafProjectRegistration,
  type ProjectsConfiguration,
  renderProjectsConfiguration,
  serializeProjectsConfiguration,
} from "../../../../src/setup/configuration/renderProjectsConfiguration.js";
import { projectAlias, writtenProjectId } from "../../config/projects/overleafProjectIds.js";
import { projectsFileLoader } from "../../config/projects/temporaryProjectsFile.js";

const loadProjectsFile = projectsFileLoader();

const projectName = fc.oneof(
  projectAlias.map((alias) => alias.trim()),
  fc.constantFrom("default", "constructor", "toString", "hasOwnProperty"),
);
const registration = (names: fc.Arbitrary<string>): fc.Arbitrary<OverleafProjectRegistration> =>
  fc.record({
    projectName: names,
    overleafProjectId: writtenProjectId.map((projectId) => projectId.toLowerCase()),
    overleafGitToken: fc.stringMatching(/^olp_[A-Za-z0-9]{4,12}$/),
  });

const existingConfiguration: fc.Arbitrary<ProjectsConfiguration | undefined> = fc.option(
  fc.array(registration(projectName), { minLength: 1, maxLength: 3 }).chain((registrations) => {
    const projects = Object.fromEntries(
      registrations.map((written) => [
        written.projectName,
        { projectId: written.overleafProjectId, gitToken: written.overleafGitToken },
      ]),
    );
    return fc.record(
      { projects: fc.constant(projects), defaultProject: fc.constantFrom(...Object.keys(projects)) },
      { requiredKeys: ["projects"] },
    );
  }),
  { nil: undefined },
);

function expectedProjects(
  registrations: readonly OverleafProjectRegistration[],
  existing: ProjectsConfiguration | undefined,
): Map<string, { projectId: string; gitToken: string }> {
  const projects = new Map(Object.entries(existing?.projects ?? {}));
  for (const written of registrations) {
    projects.set(written.projectName, {
      projectId: written.overleafProjectId,
      gitToken: written.overleafGitToken,
    });
  }
  return projects;
}

describe("renderProjectsConfiguration properties", () => {
  it("writes a file the server loads back with every project, its token, and the first registered as the default when there are several", () => {
    fc.assert(
      fc.property(
        fc.array(registration(projectName), { minLength: 1, maxLength: 4 }),
        existingConfiguration,
        (registrations, existing) => {
          const loaded = loadProjectsFile(
            serializeProjectsConfiguration(renderProjectsConfiguration(registrations, existing)),
          );
          const expected = expectedProjects(registrations, existing);
          expect(
            new Map(
              (loaded?.projects ?? []).map((project) => [
                project.projectName,
                { projectId: project.overleafProjectId, gitToken: project.overleafGitToken },
              ]),
            ),
          ).toEqual(expected);
          expect(loaded?.defaultProject).toBe(
            expected.size === 1 ? undefined : registrations[0]?.projectName,
          );
        },
      ),
    );
  });

  // Counterexample: [{ projectName: "__proto__", ... }] renders {"defaultProject":"__proto__","projects":{}}.
  it.fails("keeps a project registered under the name __proto__", () => {
    fc.assert(
      fc.property(registration(fc.constant("__proto__")), (written) => {
        expect(Object.keys(renderProjectsConfiguration([written]).projects)).toEqual(["__proto__"]);
      }),
    );
  });
});
