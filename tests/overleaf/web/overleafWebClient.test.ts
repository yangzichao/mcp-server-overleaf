import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OverleafWebClient, readCsrfTokenFromPage } from "../../../src/overleaf/web/overleafWebClient.js";
import { OverleafWebRequestError } from "../../../src/overleaf/web/overleafWebErrors.js";
import { FakeOverleafRealtime } from "../../integration/fakeOverleafRealtime.js";

const THREAD_ID = "aaaaaaaaaaaaaaaaaa000001";

describe("the Overleaf web client", () => {
  let overleaf: FakeOverleafRealtime;

  beforeEach(async () => {
    overleaf = await FakeOverleafRealtime.start();
    overleaf.web.addThread(THREAD_ID, [{ author: "Ada", content: "First." }]);
  });

  afterEach(async () => {
    await overleaf.stop();
  });

  function client(cookieHeader = overleaf.cookieHeader): OverleafWebClient {
    return new OverleafWebClient({
      baseUrl: `${overleaf.baseUrl}/some/path`,
      cookieHeader,
      requestTimeoutMs: 5_000,
    });
  }

  const messagesPath = (): string => `/project/${overleaf.projectId}/thread/${THREAD_ID}/messages`;

  it("reads the CSRF token once from the project page and reuses it", async () => {
    const webClient = client();
    await webClient.postJson(messagesPath(), { content: "Second." });
    await webClient.postJson(messagesPath(), { content: "Third." });
    expect(overleaf.web.requests.filter((request) => request.path === "/project")).toHaveLength(1);
    const posts = overleaf.web.requests.filter((request) => request.method === "POST");
    expect(posts.map((request) => request.csrfToken)).toEqual([
      overleaf.web.csrfToken,
      overleaf.web.csrfToken,
    ]);
  });

  it("fetches a new token once when Overleaf refuses the cached one", async () => {
    const webClient = client();
    await webClient.postJson(messagesPath(), { content: "Second." });
    overleaf.web.rotateCsrfToken();
    await webClient.postJson(messagesPath(), { content: "Third." });
    expect(overleaf.web.threads.get(THREAD_ID)?.messages.map((message) => message.content)).toEqual([
      "First.",
      "Second.",
      "Third.",
    ]);
  });

  it("turns the login redirect into an expired-session error", async () => {
    const failure = await client("unrelated=1")
      .getJson(`/project/${overleaf.projectId}/threads`)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(OverleafWebRequestError);
    expect((failure as OverleafWebRequestError).status).toBe(401);
  });

  it("returns undefined for an empty success and parsed JSON otherwise", async () => {
    const webClient = client();
    expect(await webClient.postJson(messagesPath(), { content: "Second." })).toBeUndefined();
    const threads = (await webClient.getJson(`/project/${overleaf.projectId}/threads`)) as Record<
      string,
      unknown
    >;
    expect(Object.keys(threads)).toEqual([THREAD_ID]);
  });

  it("finds the token in the meta tag the page layout writes", () => {
    expect(readCsrfTokenFromPage('<meta name="ol-csrfToken" content="abc-123">')).toBe("abc-123");
    expect(readCsrfTokenFromPage("<html></html>")).toBeUndefined();
  });
});
