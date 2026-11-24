import { ConfigurationError } from "../../config/configurationError.js";
import { REVIEW_CREDENTIALS_MISSING_MESSAGE } from "../../config/review/reviewCredentials.js";
import type { OverleafWebClient } from "../../overleaf/web/overleafWebClient.js";
import type { ToolContext } from "../toolContext.js";

/** The web-application client, configured whenever a session cookie is. */
export function requireOverleafWebClient(context: ToolContext): OverleafWebClient {
  if (!context.overleafWebClient) throw new ConfigurationError(REVIEW_CREDENTIALS_MISSING_MESSAGE);
  return context.overleafWebClient;
}
