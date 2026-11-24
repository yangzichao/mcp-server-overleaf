import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../../../../src/config/configurationError.js";
import { projectAlias, writtenProjectId } from "./overleafProjectIds.js";
import { projectsFileLoader } from "./temporaryProjectsFile.js";

const loadProjectsFile = projectsFileLoader();

const secretToken = fc.stringMatching(/^olp_[A-Za-z0-9]{8,16}$/);

const projectEntry = fc.record(
  {
    projectId: fc.oneof(writtenProjectId, fc.constantFrom("not-an-id", "", "0123456789abcdef0123456")),
    gitToken: fc.oneof(
      secretToken,
      secretToken.map((token) => ` ${token}\n`),
      secretToken.map((token) => `${token}\nsecond line`),
      fc.constant(""),
    ),
    // Relative, so a generated file never makes the loader read a real path on this machine.
    gitTokenFile: fc.constantFrom("token.txt", "../token", ""),
    name: fc.oneof(projectAlias, fc.constant("")),
    unexpected: fc.jsonValue({ maxDepth: 1 }),
  },
  { requiredKeys: ["projectId"] },
);
const nearlyValidConfiguration = fc.record(
  {
    projects: fc.dictionary(fc.oneof(projectAlias, fc.constantFrom(" ", "")), projectEntry, { maxKeys: 3 }),
    defaultProject: fc.oneof(projectAlias, fc.constant(" ")),
    unexpected: fc.jsonValue({ maxDepth: 1 }),
  },
  { requiredKeys: [] },
);
const fileContents = fc.oneof(
  nearlyValidConfiguration.map((configuration) => JSON.stringify(configuration)),
  nearlyValidConfiguration.map((configuration) => JSON.stringify(configuration).slice(0, -3)),
  fc.jsonValue({ maxDepth: 3 }).map((value) => JSON.stringify(value)),
  fc.string({ maxLength: 30 }),
);

const validEntry = fc.record(
  { projectId: writtenProjectId, gitToken: secretToken, name: projectAlias },
  { requiredKeys: ["projectId"] },
);
const validConfiguration = fc
  .dictionary(
    projectAlias.map((alias) => alias.trim()),
    validEntry,
    { minKeys: 1, maxKeys: 3 },
  )
  .chain((projects) =>
    fc.record(
      { projects: fc.constant(projects), defaultProject: fc.constantFrom(...Object.keys(projects)) },
      { requiredKeys: ["projects"] },
    ),
  );

describe("loadProjectConfigurationFile properties", () => {
  it("reads any file into projects or refuses it with a ConfigurationError that repeats no token", () => {
    fc.assert(
      fc.property(fileContents, (contents) => {
        try {
          loadProjectsFile(contents);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigurationError);
          for (const token of contents.match(/olp_[A-Za-z0-9]+/g) ?? []) {
            expect((error as Error).message).not.toContain(token);
          }
        }
      }),
    );
  });

  it("reads every project of a valid file with its id in lower case, its display name and its token", () => {
    fc.assert(
      fc.property(validConfiguration, (configuration) => {
        const loaded = loadProjectsFile(JSON.stringify(configuration));
        expect(loaded).toEqual({
          projects: Object.entries(configuration.projects).map(([projectName, project]) => ({
            projectName,
            overleafProjectId: project.projectId.toLowerCase(),
            ...(project.name ? { displayName: project.name.trim() } : {}),
            ...(project.gitToken ? { overleafGitToken: project.gitToken } : {}),
          })),
          ...(configuration.defaultProject ? { defaultProject: configuration.defaultProject } : {}),
        });
      }),
    );
  });
});
