import type { FakeAccountProject } from "../../integration/fakeOverleafAccount.js";
import type { OverleafEditorScenario } from "../support/overleafEditorScenario.js";

export function accountProjectNamed(scenario: OverleafEditorScenario, name: string): FakeAccountProject {
  const project = scenario.world.account.projects.find((candidate) => candidate.name === name);
  if (!project) throw new Error(`The account holds no project "${name}".`);
  return project;
}

/** The address a person copies from the browser, which is how they name a project to a tool. */
export function overleafAddressOf(scenario: OverleafEditorScenario, name: string): string {
  return `${scenario.world.editor.baseUrl}/project/${accountProjectNamed(scenario, name)._id}`;
}

export function webRequestsMatching(scenario: OverleafEditorScenario, pathPattern: RegExp): string[] {
  return scenario.world.web.requests
    .filter((request) => pathPattern.test(request.path))
    .map((request) => `${request.method} ${request.path}`);
}
