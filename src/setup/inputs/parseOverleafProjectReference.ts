import { SetupError } from "../setupError.js";

const BARE_PROJECT_ID = /^[0-9a-f]{24}$/i;
const PROJECT_URL = /\/project\/([0-9a-f]{24})/i;
const READ_ONLY_SHARE_LINK = /overleaf\.com\/(read|:?\w+)\/[A-Za-z]{8,}/i;

/**
 * Asking someone for a "project id" means asking them to know which part of a URL that is.
 * The address bar is the thing they already have, so accept it whole and take the id out.
 */
export function parseOverleafProjectReference(reference: string): string {
  const trimmed = reference.trim();
  if (BARE_PROJECT_ID.test(trimmed)) return trimmed.toLowerCase();

  const matchedUrl = PROJECT_URL.exec(trimmed);
  if (matchedUrl?.[1]) return matchedUrl[1].toLowerCase();

  if (READ_ONLY_SHARE_LINK.test(trimmed)) {
    throw new SetupError(
      "That is a share link, not a project address.",
      "Open the project in Overleaf and copy the address bar URL, which contains /project/ followed by 24 characters.",
    );
  }

  throw new SetupError(
    `Could not find an Overleaf project id in "${trimmed}".`,
    "Paste the address bar URL of the open project, or the 24-character id at the end of it.",
  );
}
