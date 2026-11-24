import { hasGitBridgeCredential } from "../config/missingOverleafCredential.js";
import type { ServerConfiguration } from "../config/serverConfiguration.js";

export interface OfferedToolGroups {
  readonly gitBridgeToolsOffered: boolean;
  readonly sessionCookieToolsOffered: boolean;
}

/**
 * Which tools a configuration lists. With one credential, only the tools it can serve: the
 * others would answer every call with a setup note. With none, all of them, because a
 * directory's sandbox starts the server that way and should see everything it offers.
 */
export function decideOfferedToolGroups(configuration: ServerConfiguration): OfferedToolGroups {
  const gitBridgeCredential = hasGitBridgeCredential(configuration);
  const sessionCookie = configuration.reviewCredentials !== undefined;
  const nothingConfigured = !gitBridgeCredential && !sessionCookie;
  return {
    gitBridgeToolsOffered: gitBridgeCredential || nothingConfigured,
    sessionCookieToolsOffered: sessionCookie || nothingConfigured,
  };
}
