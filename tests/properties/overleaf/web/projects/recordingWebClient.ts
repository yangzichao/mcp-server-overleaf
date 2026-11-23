import type { OverleafWebClient } from "../../../../../src/overleaf/web/overleafWebClient.js";

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

export function recordingWebClient(
  answer: (request: SentRequest) => unknown = () => undefined,
): RecordingWebClient {
  const sent: SentRequest[] = [];
  const respond = async (request: SentRequest): Promise<unknown> => {
    sent.push(request);
    return await answer(request);
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

export function changesSent(sent: readonly SentRequest[]): SentRequest[] {
  return sent.filter((request) => request.method !== "GET");
}
