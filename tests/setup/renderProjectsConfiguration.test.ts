import { describe, expect, it } from "vitest";
import { renderProjectsConfiguration } from "../../src/setup/configuration/renderProjectsConfiguration.js";

const paper = {
  projectName: "paper",
  overleafProjectId: "64a1b2c3d4e5f6a7b8c9d0e1",
  overleafGitToken: "olp_first",
};
const thesis = {
  projectName: "thesis",
  overleafProjectId: "65b2c3d4e5f6a7b8c9d0e1f2",
  overleafGitToken: "olp_first",
};

describe("renderProjectsConfiguration", () => {
  it("writes the shape the server already discovers, with the token beside the project", () => {
    expect(renderProjectsConfiguration([paper])).toEqual({
      projects: { paper: { projectId: "64a1b2c3d4e5f6a7b8c9d0e1", gitToken: "olp_first" } },
    });
  });

  it("leaves a single project without a default, since it already is one", () => {
    expect(renderProjectsConfiguration([paper]).defaultProject).toBeUndefined();
  });

  it("makes the first project the default once there is more than one", () => {
    expect(renderProjectsConfiguration([paper, thesis]).defaultProject).toBe("paper");
  });

  it("keeps projects that were already configured", () => {
    const existing = {
      projects: { older: { projectId: "66c3d4e5f6a7b8c9d0e1f2a3", gitToken: "olp_older" } },
    };
    const merged = renderProjectsConfiguration([paper], existing);
    expect(Object.keys(merged.projects).sort()).toEqual(["older", "paper"]);
  });

  it("replaces a project registered under the same name", () => {
    const existing = {
      projects: { paper: { projectId: "66c3d4e5f6a7b8c9d0e1f2a3", gitToken: "olp_older" } },
    };
    expect(renderProjectsConfiguration([paper], existing).projects.paper).toEqual({
      projectId: "64a1b2c3d4e5f6a7b8c9d0e1",
      gitToken: "olp_first",
    });
  });
});
