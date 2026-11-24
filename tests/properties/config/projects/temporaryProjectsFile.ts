import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";

import {
  loadProjectConfigurationFile,
  type ProjectFileConfiguration,
} from "../../../../src/config/projects/projectConfigurationFile.js";

/** Loads projects.json text the way the server does, from one file in a folder the suite removes. */
export function projectsFileLoader(): (fileContents: string) => ProjectFileConfiguration | undefined {
  let directory = "";
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "overleaf-projects-property-"));
  });
  afterAll(() => rmSync(directory, { recursive: true, force: true }));
  return (fileContents) => {
    const filePath = join(directory, "projects.json");
    writeFileSync(filePath, fileContents);
    return loadProjectConfigurationFile({ OVERLEAF_PROJECTS_CONFIG: filePath });
  };
}
