import fc from "fast-check";

/** A project id in the case a user might paste it: Overleaf writes lower case, a hand-typed one may not be. */
export const writtenProjectId = fc.stringMatching(/^[0-9a-fA-F]{24}$/);

/** A name for a project in OVERLEAF_PROJECTS: anything but a comma or `=`, and not blank. */
export const projectAlias = fc
  .string({
    unit: fc.constantFrom("p", "a", "P", "1", "-", "_", ".", " ", "北", "😀"),
    minLength: 1,
    maxLength: 8,
  })
  .filter((alias) => alias.trim() !== "");

export const surroundingWhitespace = fc.constantFrom("", " ", "\t", "\n", " \r\n ");

const textAroundAnAddress = fc.constantFrom(
  "",
  "https://www.overleaf.com",
  "http://localhost:8080",
  "www.overleaf.com",
  "https://overleaf.example.edu/sub",
);
const textAfterAnAddress = fc.constantFrom("", "/", "?x=1", "#section", "/detacher", "abc", "0");

/** The address bar of an open project, as copied from a browser. */
export const projectAddress = fc
  .tuple(textAroundAnAddress, writtenProjectId, textAfterAnAddress, fc.constantFrom("/project/", "/Project/"))
  .map(([origin, projectId, after, segment]) => ({
    projectId,
    written: `${origin}${segment}${projectId}${after}`,
  }));
