import { describeFailedResponse, expiredSessionError, OverleafWebRequestError } from "./overleafWebErrors.js";

/**
 * Overleaf's web application, reached the way its own editor reaches it: JSON over HTTP, with
 * the browser session cookie and a CSRF token on every request that changes something.
 *
 * The contract is the one `services/web/frontend/js/infrastructure/fetch-json.ts` in
 * `overleaf/overleaf` follows: `Content-Type` and `Accept` set to JSON, and the token from the
 * page's `ol-csrfToken` meta tag sent as `X-Csrf-Token`. The token belongs to the session, so it
 * is read once and reused until Overleaf refuses it.
 *
 * Redirects are not followed. Overleaf answers an unrecognised session by redirecting to its
 * login page, and following that would turn an expired cookie into a confusing HTML response.
 */

export interface OverleafWebClientOptions {
  readonly baseUrl: string;
  readonly cookieHeader: string;
  readonly requestTimeoutMs?: number;
}

export interface WebRequestOptions {
  readonly timeoutMs?: number;
}

export interface DownloadOptions extends WebRequestOptions {
  readonly maximumBytes?: number;
}

export interface DownloadedBytes {
  readonly bytes: Buffer;
  readonly contentType: string | undefined;
}

type RequestBody = NonNullable<RequestInit["body"]>;

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
/** A compiled paper or a project archive; anything larger is refused rather than buffered. */
const MAXIMUM_DOWNLOAD_BYTES = 200 * 1024 * 1024;

const CSRF_META_PATTERN = /<meta\s+name="ol-csrfToken"\s+content="([^"]+)"/;

/** Exported for tests: the dashboard page carries the token in a meta tag. */
export function readCsrfTokenFromPage(html: string): string | undefined {
  return CSRF_META_PATTERN.exec(html)?.[1];
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

export class OverleafWebClient {
  private readonly origin: string;
  private readonly cookieHeader: string;
  private readonly requestTimeoutMs: number;
  private csrfToken: string | undefined;

  constructor(options: OverleafWebClientOptions) {
    this.origin = new URL(options.baseUrl).origin;
    this.cookieHeader = options.cookieHeader;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  get baseUrl(): string {
    return this.origin;
  }

  async getJson(path: string, options: WebRequestOptions = {}): Promise<unknown> {
    const response = await this.send("GET", path, { accept: "application/json" }, undefined, options);
    return await readJsonBody(response);
  }

  async postJson(path: string, body?: unknown, options: WebRequestOptions = {}): Promise<unknown> {
    const response = await this.sendWithCsrf(
      "POST",
      path,
      { "content-type": "application/json", accept: "application/json" },
      () => JSON.stringify(body ?? {}),
      options,
    );
    return await readJsonBody(response);
  }

  /** For the routes that answer `res.sendStatus(200)`, whose "OK" body is not JSON. */
  async postIgnoringAnswer(path: string, body?: unknown, options: WebRequestOptions = {}): Promise<void> {
    const response = await this.sendWithCsrf(
      "POST",
      path,
      { "content-type": "application/json", accept: "application/json" },
      () => JSON.stringify(body ?? {}),
      options,
    );
    await response.body?.cancel();
  }

  /** An HTML page, for the settings Overleaf hands its editor only in meta tags. */
  async getPage(path: string, options: WebRequestOptions = {}): Promise<string> {
    const response = await this.send("GET", path, { accept: "text/html" }, undefined, options);
    return await response.text();
  }

  async delete(path: string, options: WebRequestOptions = {}): Promise<void> {
    await this.sendWithCsrf("DELETE", path, { accept: "application/json" }, undefined, options);
  }

  /** A multipart upload, for the routes that take a file rather than JSON. */
  async postForm(path: string, buildForm: () => FormData, options: WebRequestOptions = {}): Promise<unknown> {
    const response = await this.sendWithCsrf(
      "POST",
      path,
      { accept: "application/json" },
      buildForm,
      options,
    );
    return await readJsonBody(response);
  }

  async download(path: string, options: DownloadOptions = {}): Promise<DownloadedBytes> {
    const maximumBytes = options.maximumBytes ?? MAXIMUM_DOWNLOAD_BYTES;
    const response = await this.send("GET", path, {}, undefined, options);
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > maximumBytes) {
      await response.body?.cancel();
      throw tooLargeToDownload(path, declaredLength, maximumBytes, response.status);
    }
    const bytes = await readBodyWithinLimit(response, path, maximumBytes);
    return { bytes, contentType: response.headers.get("content-type") ?? undefined };
  }

  /**
   * A mutating request, retried once with a fresh token if Overleaf refuses the cached one.
   * The token outlives most requests but not a session that was signed out and back in.
   */
  private async sendWithCsrf(
    method: string,
    path: string,
    headers: Record<string, string>,
    buildBody: (() => RequestBody) | undefined,
    options: WebRequestOptions,
  ): Promise<Response> {
    const hadCachedToken = this.csrfToken !== undefined;
    try {
      const token = await this.readCsrfToken();
      return await this.send(method, path, { ...headers, "x-csrf-token": token }, buildBody?.(), options);
    } catch (error) {
      if (!(hadCachedToken && error instanceof OverleafWebRequestError && error.status === 403)) throw error;
      this.csrfToken = undefined;
      const token = await this.readCsrfToken();
      return await this.send(method, path, { ...headers, "x-csrf-token": token }, buildBody?.(), options);
    }
  }

  private async readCsrfToken(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    const response = await this.send("GET", "/project", { accept: "text/html" }, undefined, {});
    const token = readCsrfTokenFromPage(await response.text());
    if (!token) {
      throw new OverleafWebRequestError(
        "Overleaf's project page did not carry a CSRF token, so no change can be sent.",
        response.status,
        "The address in OVERLEAF_WEB_BASE_URL may not be an Overleaf instance.",
      );
    }
    this.csrfToken = token;
    return token;
  }

  private async send(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: RequestBody | undefined,
    options: WebRequestOptions,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.origin}${path}`, {
        method,
        headers: { ...headers, cookie: this.cookieHeader },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? this.requestTimeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new OverleafWebRequestError(
        `Could not reach Overleaf for ${method} ${path}: ${reason}`,
        undefined,
      );
    }
    if (isRedirect(response.status)) {
      const location = response.headers.get("location") ?? "";
      if (/\/login\b/.test(location)) throw expiredSessionError();
      throw new OverleafWebRequestError(
        `Overleaf redirected ${method} ${path} to ${location || "an unnamed location"}.`,
        response.status,
      );
    }
    if (!response.ok) {
      throw describeFailedResponse(method, path, response.status, await response.text());
    }
    return response;
  }
}

function tooLargeToDownload(
  path: string,
  size: number,
  maximumBytes: number,
  status: number,
): OverleafWebRequestError {
  return new OverleafWebRequestError(
    `Overleaf offered ${size} bytes for ${path}, more than the ${maximumBytes} this server will download.`,
    status,
  );
}

/** Counts while reading, because a response without Content-Length can still be huge. */
async function readBodyWithinLimit(response: Response, path: string, maximumBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.byteLength;
    // Leaving the loop by throwing cancels the stream, so the rest is never transferred.
    if (received > maximumBytes) throw tooLargeToDownload(path, received, maximumBytes, response.status);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** An empty body (204, or a 200 with nothing in it) is a success with nothing to say. */
async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new OverleafWebRequestError(
      "Overleaf answered with something other than JSON.",
      response.status,
      "The address in OVERLEAF_WEB_BASE_URL may be reaching a sign-in page or a proxy rather than Overleaf.",
    );
  }
}
