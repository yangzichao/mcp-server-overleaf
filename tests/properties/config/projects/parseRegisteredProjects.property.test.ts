import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../../../../src/config/configurationError.js";
import { parseRegisteredProjects } from "../../../../src/config/projects/parseRegisteredProjects.js";
import { projectAlias, writtenProjectId } from "./overleafProjectIds.js";

const spacing = fc.constantFrom("", " ", "\t", "  ");

const writtenEntry = fc.oneof(
  fc.tuple(projectAlias, writtenProjectId, spacing, spacing).map(([alias, projectId, before, after]) => ({
    written: `${before}${alias}${before}=${after}${projectId}${after}`,
    expected: { projectName: alias.trim(), overleafProjectId: projectId.toLowerCase() },
  })),
  fc.tuple(writtenProjectId, spacing).map(([projectId, around]) => ({
    written: `${around}${projectId}${around}`,
    expected: { projectName: projectId, overleafProjectId: projectId.toLowerCase() },
  })),
);
const emptyEntry = spacing.map((written) => ({ written, expected: undefined }));

const anyEnvironmentValue = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc
    .array(
      fc.oneof(
        fc.constantFrom(",", "=", " ", "paper", "0123456789abcdef01234567"),
        fc.string({ maxLength: 3 }),
      ),
      {
        maxLength: 10,
      },
    )
    .map((pieces) => pieces.join("")),
);

describe("parseRegisteredProjects properties", () => {
  it("reads back every name=id and bare id entry, in order, skipping empty entries", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(writtenEntry, emptyEntry), { maxLength: 6 }), (entries) => {
        const written = entries.map((entry) => entry.written).join(",");
        const expected = entries.flatMap((entry) => (entry.expected ? [entry.expected] : []));
        expect(parseRegisteredProjects(written)).toEqual(expected);
      }),
    );
  });

  it("gives projects with a name and a lower-case id, or refuses with a ConfigurationError", () => {
    fc.assert(
      fc.property(anyEnvironmentValue, (written) => {
        let projects: ReturnType<typeof parseRegisteredProjects>;
        try {
          projects = parseRegisteredProjects(written);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigurationError);
          return;
        }
        for (const project of projects) {
          expect(project.projectName.trim()).not.toBe("");
          expect(project.overleafProjectId).toMatch(/^[0-9a-f]{24}$/);
        }
      }),
    );
  });
});
