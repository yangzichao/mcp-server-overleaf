import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  type OverleafProjectRegistration,
  type ProjectsConfiguration,
  renderProjectsConfiguration,
  serializeProjectsConfiguration,
} from "./renderProjectsConfiguration.js";
import { projectsConfigurationFilePath, userConfigurationDirectory } from "./userConfigurationPaths.js";

export interface WrittenProjectsConfiguration {
  readonly filePath: string;
  readonly backupPath?: string;
  readonly projectNames: readonly string[];
}

function readExistingConfiguration(filePath: string): ProjectsConfiguration | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as ProjectsConfiguration;
    return parsed.projects && typeof parsed.projects === "object" ? parsed : undefined;
  } catch {
    // A file we cannot parse is replaced, not merged into. The backup keeps the original.
    return undefined;
  }
}

export function writeProjectsConfiguration(
  registrations: readonly OverleafProjectRegistration[],
  environment: NodeJS.ProcessEnv = process.env,
): WrittenProjectsConfiguration {
  const directory = userConfigurationDirectory(environment);
  const filePath = projectsConfigurationFilePath(environment);
  const existingConfiguration = readExistingConfiguration(filePath);

  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const backupPath = existsSync(filePath) ? `${filePath}.previous` : undefined;
  if (backupPath) copyFileSync(filePath, backupPath);

  const configuration = renderProjectsConfiguration(registrations, existingConfiguration);
  writeFileSync(filePath, serializeProjectsConfiguration(configuration), { mode: 0o600 });

  return {
    filePath,
    ...(backupPath ? { backupPath } : {}),
    projectNames: Object.keys(configuration.projects),
  };
}
