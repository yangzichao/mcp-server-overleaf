export interface OverleafProjectRegistration {
  readonly projectName: string;
  readonly overleafProjectId: string;
  readonly overleafGitToken: string;
}

export interface ProjectsConfiguration {
  readonly defaultProject?: string;
  readonly projects: Record<string, { projectId: string; gitToken: string }>;
}

/**
 * The shape `loadProjectConfigurationFile` accepts. Keeping the token here rather than in
 * each client's own configuration means one file, with permissions the user controls,
 * instead of the same secret copied into Claude Desktop, Cursor and Codex.
 */
export function renderProjectsConfiguration(
  registrations: readonly OverleafProjectRegistration[],
  existingConfiguration?: ProjectsConfiguration,
): ProjectsConfiguration {
  const projects: Record<string, { projectId: string; gitToken: string }> = {
    ...(existingConfiguration?.projects ?? {}),
  };
  for (const registration of registrations) {
    projects[registration.projectName] = {
      projectId: registration.overleafProjectId,
      gitToken: registration.overleafGitToken,
    };
  }

  const firstRegistration = registrations[0];
  const defaultProject =
    Object.keys(projects).length === 1
      ? undefined
      : (firstRegistration?.projectName ?? existingConfiguration?.defaultProject);

  return { ...(defaultProject ? { defaultProject } : {}), projects };
}

export function serializeProjectsConfiguration(configuration: ProjectsConfiguration): string {
  return `${JSON.stringify(configuration, null, 2)}\n`;
}
