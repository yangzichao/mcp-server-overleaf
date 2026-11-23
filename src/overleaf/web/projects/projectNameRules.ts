import { RequestNotSentError } from "../overleafWebErrors.js";

/**
 * The checks `ProjectDetailsHandler.validateProjectName` makes, so a bad name fails here with
 * Overleaf's own reason instead of as a bare 400. Overleaf trims the name first, and so does this.
 */

const MAXIMUM_PROJECT_NAME_LENGTH = 150;

export function checkProjectName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new RequestNotSentError("Project name cannot be blank.");
  if (trimmed.length > MAXIMUM_PROJECT_NAME_LENGTH) {
    throw new RequestNotSentError(
      `Project name is too long: Overleaf allows ${MAXIMUM_PROJECT_NAME_LENGTH} characters.`,
    );
  }
  if (trimmed.includes("/")) throw new RequestNotSentError("Project name cannot contain / characters.");
  if (trimmed.includes("\\")) throw new RequestNotSentError("Project name cannot contain \\ characters.");
  return trimmed;
}
