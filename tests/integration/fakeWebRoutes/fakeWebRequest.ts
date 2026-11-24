import type { FakeAnswer } from "../fakeWebAnswers.js";

/** One request to the fake web application, after its body has been read. */
export interface FakeWebRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: Buffer;
  readonly contentType: string | undefined;
}

/** A group of routes; undefined lets the next group try. */
export interface FakeWebRoutes {
  route(request: FakeWebRequest): FakeAnswer | Promise<FakeAnswer> | undefined;
}

export function readJsonBody(request: FakeWebRequest): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(request.body.toString("utf8") || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** What multer gives `uploadFile`: the text fields, and the `qqfile` part's bytes. */
export async function readMultipartUpload(
  request: FakeWebRequest,
): Promise<{ fields: Map<string, string>; file: Buffer | undefined }> {
  const form = await new Response(new Uint8Array(request.body), {
    headers: { "content-type": request.contentType ?? "" },
  }).formData();
  const fields = new Map<string, string>();
  let file: Buffer | undefined;
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields.set(key, value);
    else if (key === "qqfile") file = Buffer.from(await value.arrayBuffer());
  }
  return { fields, file };
}

/** Express matches routes ignoring case, so `/Project/:id` and `/project/:id` are one route. */
export function matchPath(
  request: FakeWebRequest,
  method: string,
  pattern: RegExp,
): RegExpExecArray | undefined {
  if (request.method !== method) return undefined;
  return pattern.exec(request.path) ?? undefined;
}
