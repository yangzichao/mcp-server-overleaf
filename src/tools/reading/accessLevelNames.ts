/**
 * Overleaf's access levels in the words its share dialog uses. `ProjectListController` names
 * edit access two ways: `readWrite` for a collaborator who was invited, `readAndWrite` for one
 * who joined through a link, and the editor's session reports `readAndWrite` as well.
 */
const ACCESS_LEVEL_NAMES: Readonly<Record<string, string>> = {
  owner: "owner",
  readWrite: "can edit",
  readAndWrite: "can edit",
  review: "can review",
  readOnly: "can view",
};

export function describeAccessLevel(accessLevel: string): string {
  return ACCESS_LEVEL_NAMES[accessLevel] ?? accessLevel;
}
