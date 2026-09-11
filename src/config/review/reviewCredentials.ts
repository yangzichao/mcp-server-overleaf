import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

import { ConfigurationError } from "../configurationError.js";

/**
 * The credential the review tools need, which is not the one every other tool uses.
 *
 * Overleaf's Git bridge takes a scoped token. Its editor takes a browser session, and there is
 * no token equivalent: `services/real-time/app/js/SessionSockets.js` authenticates a connection
 * only by looking a signed session cookie up in the session store. So tracked changes and
 * review comments need a cookie copied out of a signed-in browser, and that cookie carries the
 * whole account, not one project.
 *
 * It is therefore kept separate and optional. A server with no cookie configured runs every
 * Git-bridge tool exactly as before and refuses only the review tools, with a message saying
 * what to set.
 */

export interface OverleafReviewCredentials {
  /** A complete Cookie header value, ready to send. */
  readonly cookieHeader: string;
  /** Origin of the Overleaf web application, which is not the Git bridge's host. */
  readonly webBaseUrl: string;
}

const DEFAULT_WEB_BASE_URL = "https://www.overleaf.com";

/** What overleaf.com calls its session cookie; self-hosted installations often use the other. */
const KNOWN_SESSION_COOKIE_NAMES = ["overleaf_session2", "sharelatex.sid"] as const;

function readCookieFile(filePath: string): string {
  if (!isAbsolute(filePath)) {
    throw new ConfigurationError("OVERLEAF_SESSION_COOKIE_FILE must be an absolute path.");
  }
  try {
    const contents = readFileSync(filePath, "utf8").trim();
    if (!contents) throw new Error("empty");
    return contents;
  } catch {
    throw new ConfigurationError(
      "Cannot read an Overleaf session cookie from the configured OVERLEAF_SESSION_COOKIE_FILE.",
    );
  }
}

/**
 * Accepts what a browser's developer tools actually put on the clipboard, which is one of:
 * the whole `document.cookie` string, a single `name=value` pair, or the bare value. A bare
 * value is given the overleaf.com cookie name, because that is the only name it can be.
 */
export function normaliseSessionCookie(raw: string): string {
  const trimmed = raw.trim().replace(/;\s*$/, "");
  if (!trimmed) {
    throw new ConfigurationError("The Overleaf session cookie is empty.");
  }
  if (/[\r\n\0]/.test(trimmed)) {
    throw new ConfigurationError("The Overleaf session cookie must be a single line.");
  }
  const pairs = trimmed
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean);
  const sessionPair = pairs.find((pair) =>
    KNOWN_SESSION_COOKIE_NAMES.some((name) => pair.startsWith(`${name}=`)),
  );
  if (sessionPair) return sessionPair;
  const onlyPair = pairs.length === 1 ? pairs[0] : undefined;
  if (onlyPair && !onlyPair.includes("=")) {
    return `${KNOWN_SESSION_COOKIE_NAMES[0]}=${onlyPair}`;
  }
  throw new ConfigurationError(
    `The Overleaf session cookie must contain ${KNOWN_SESSION_COOKIE_NAMES.join(" or ")}. Copy that one cookie from a browser where you are signed in to Overleaf.`,
  );
}

export function loadReviewCredentials(environment: NodeJS.ProcessEnv): OverleafReviewCredentials | undefined {
  const raw = environment.OVERLEAF_SESSION_COOKIE?.trim()
    ? environment.OVERLEAF_SESSION_COOKIE
    : environment.OVERLEAF_SESSION_COOKIE_FILE?.trim()
      ? readCookieFile(environment.OVERLEAF_SESSION_COOKIE_FILE.trim())
      : undefined;
  if (!raw) return undefined;

  const configuredBaseUrl = environment.OVERLEAF_WEB_BASE_URL?.trim() || DEFAULT_WEB_BASE_URL;
  let webBaseUrl: string;
  try {
    webBaseUrl = new URL(configuredBaseUrl).origin;
  } catch {
    throw new ConfigurationError(`OVERLEAF_WEB_BASE_URL is not a URL: "${configuredBaseUrl}".`);
  }
  return { cookieHeader: normaliseSessionCookie(raw), webBaseUrl };
}

/**
 * Both forms the cookie can take in a message: the whole header, and the value on its own.
 * An error from a proxy or from Overleaf may quote either, and only the value is the secret.
 */
export function reviewCredentialSecrets(
  credentials: OverleafReviewCredentials | undefined,
): readonly string[] {
  if (!credentials) return [];
  const separator = credentials.cookieHeader.indexOf("=");
  const value = separator === -1 ? "" : credentials.cookieHeader.slice(separator + 1);
  return [credentials.cookieHeader, value];
}

/** The message every review tool gives when no cookie is configured, kept in one place. */
export const REVIEW_CREDENTIALS_MISSING_MESSAGE =
  "Tracked changes need an Overleaf session cookie, which is a different credential from the Git token. " +
  "Set OVERLEAF_SESSION_COOKIE to the value of your overleaf_session2 cookie, copied from a browser where you are signed in to Overleaf. " +
  "Every other tool works without it.";
