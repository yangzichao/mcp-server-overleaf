import type { OverleafWebClient } from "../../../../../src/overleaf/web/overleafWebClient.js";

/**
 * A stand-in for the web client that records each request and answers it from `answer`, so a
 * property sees what a module would send to Overleaf without anything reaching a network.
 */

export interface SentRequest {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
  readonly timeoutMs?: number | undefined;
}

export interface RecordingWebClient {
  readonly client: OverleafWebClient;
  readonly sent: SentRequest[];
}

/** An `answer` that throws makes the request reject with what it threw. */
export function recordingWebClient(
  answer: (request: SentRequest) => unknown = () => undefined,
): RecordingWebClient {
  const sent: SentRequest[] = [];
  const respond = (request: SentRequest): Promise<unknown> => {
    sent.push(request);
    return new Promise((resolve) => resolve(answer(request)));
  };
  const standIn = {
    getJson: (path: string, options: { timeoutMs?: number } = {}) =>
      respond({ method: "GET", path, timeoutMs: options.timeoutMs }),
    getPage: (path: string) => respond({ method: "GET", path }),
    postJson: (path: string, body?: unknown) => respond({ method: "POST", path, body }),
    postIgnoringAnswer: async (path: string, body?: unknown) => {
      await respond({ method: "POST", path, body });
    },
    delete: async (path: string) => {
      await respond({ method: "DELETE", path });
    },
  };
  return { client: standIn as unknown as OverleafWebClient, sent };
}

/** The requests that could change something on Overleaf. */
export function changesSent(sent: readonly SentRequest[]): SentRequest[] {
  return sent.filter((request) => request.method !== "GET");
}
