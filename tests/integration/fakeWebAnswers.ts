/** What a fake web route answers with, written to the response by `FakeOverleafWeb.handle`. */
export interface FakeAnswer {
  readonly status: number;
  readonly contentType?: string;
  readonly body?: string | Buffer;
  /** Written by the bot protection in front of overleaf.com rather than by Overleaf itself. */
  readonly fromBotProtection?: boolean;
}

/** overleaf.com's web servers name themselves in `X-Served-By` (`EXPOSE_HOSTNAME`). */
export const FAKE_SERVED_BY = "web-fake-1";

export const NO_CONTENT: FakeAnswer = { status: 204 };

export const NOT_FOUND: FakeAnswer = {
  status: 404,
  contentType: "application/json",
  body: JSON.stringify({ message: "not found" }),
};

export function jsonAnswer(value: unknown): FakeAnswer {
  return { status: 200, contentType: "application/json", body: JSON.stringify(value) };
}

/** `HttpErrorHandler.forbidden` answering a request that accepts JSON. */
export const FORBIDDEN: FakeAnswer = {
  status: 403,
  contentType: "application/json",
  body: JSON.stringify({ message: "restricted" }),
};

/** `res.sendStatus(200)`, which Express sends as plain text. */
export const PLAIN_OK: FakeAnswer = { status: 200, contentType: "text/plain", body: "OK" };

/** What `ErrorController` sends for an `InvalidNameError` or a `DuplicateNameError`. */
export function plainTextAnswer(status: number, text: string): FakeAnswer {
  return { status, contentType: "text/plain", body: text };
}

export function statusAnswer(status: number, value: unknown): FakeAnswer {
  return { status, contentType: "application/json", body: JSON.stringify(value) };
}
