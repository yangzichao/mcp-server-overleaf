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

/** A request this server did not send, because Overleaf would refuse it or misread it. Nothing changed. */
export class RequestNotSentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestNotSentError";
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
 * in `message` or `error`, and its file-tree errors are short plain text such as "file already
 * exists"; an HTML error page is noise to a model, so it is reported by status alone.
 */
export function describeFailedResponse(
  method: string,
  path: string,
  status: number,
  body: string,
): OverleafWebRequestError {
  const overleafReason = readOverleafReason(body);
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

const LONGEST_PLAIN_TEXT_REASON = 200;

function readOverleafReason(body: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return readPlainTextReason(body);
  }
  return readJsonReason(parsed);
}

function readPlainTextReason(body: string): string | undefined {
  const text = body.trim();
  if (!text || text.length > LONGEST_PLAIN_TEXT_REASON || text.includes("<")) return undefined;
  return text;
}

function readJsonReason(parsed: unknown): string | undefined {
  if (typeof parsed === "string") return parsed || undefined;
  if (!parsed || typeof parsed !== "object") return undefined;
  const { message, error } = parsed as { message?: unknown; error?: unknown };
  if (typeof message === "string" && message) return message;
  if (typeof error === "string" && error) return error;
  if (message && typeof message === "object") {
    const nested = (message as { text?: unknown }).text;
    if (typeof nested === "string") return nested;
  }
  return undefined;
}
