/**
 * Failures from Overleaf's web application, as opposed to its Git bridge or its real-time
 * socket. Each carries what the user can do about it, so a tool can say more than a status code.
 */

export class OverleafWebRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    /** What the user can do about it, kept separate so a tool can present it on its own line. */
    readonly remedy?: string,
  ) {
    super(remedy ? `${message} ${remedy}` : message);
    this.name = "OverleafWebRequestError";
  }
}

const EXPIRED_SESSION_REMEDY =
  "Copy a fresh overleaf_session2 cookie from a browser where you are signed in. Cookies stop working when you sign out, change your password, or after they expire.";

/** A redirect to the login page is how Overleaf answers a session it does not recognise. */
export function expiredSessionError(): OverleafWebRequestError {
  return new OverleafWebRequestError(
    "Overleaf did not accept the session cookie.",
    401,
    EXPIRED_SESSION_REMEDY,
  );
}

/**
 * Turns a failed response into a message worth showing. Overleaf's JSON errors put the reason
 * in `message` or `error`; anything else is reported by status alone, because an HTML error
 * page is noise to a model.
 */
export function describeFailedResponse(
  method: string,
  path: string,
  status: number,
  body: string,
): OverleafWebRequestError {
  const overleafReason = readJsonReason(body);
  const action = `${method} ${path}`;
  if (status === 401) return expiredSessionError();
  if (status === 403) {
    return new OverleafWebRequestError(
      `Overleaf refused ${action}: this account does not have permission.${overleafReason ? ` ${overleafReason}` : ""}`,
      status,
      "Check the account's access level in the project's Share menu.",
    );
  }
  if (status === 404) {
    return new OverleafWebRequestError(
      `Overleaf has nothing at ${action}.${overleafReason ? ` ${overleafReason}` : ""}`,
      status,
      "The project, document or thread id may be wrong, or this Overleaf instance may not offer the feature.",
    );
  }
  if (status === 429) {
    return new OverleafWebRequestError(
      `Overleaf is rate-limiting ${action}.`,
      status,
      "Wait a minute before trying again.",
    );
  }
  return new OverleafWebRequestError(
    `Overleaf answered ${action} with status ${status}.${overleafReason ? ` ${overleafReason}` : ""}`,
    status,
  );
}

function readJsonReason(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string" && parsed.message) return parsed.message;
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    if (parsed.message && typeof parsed.message === "object") {
      const nested = (parsed.message as { text?: unknown }).text;
      if (typeof nested === "string") return nested;
    }
  } catch {
    // Not JSON: an HTML error page, which says nothing a model can use.
  }
  return undefined;
}
