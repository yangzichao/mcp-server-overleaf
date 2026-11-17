import type { IncomingMessage, ServerResponse } from "node:http";

import { FakeOverleafAccount } from "./fakeOverleafAccount.js";
import type { FakeOverleafRealtime } from "./fakeOverleafRealtime.js";
import { type FakeAnswer, jsonAnswer, NO_CONTENT, NOT_FOUND } from "./fakeWebAnswers.js";

/**
 * The slice of Overleaf's web application the review tools call, served from the same origin
 * as the real-time fake because that is how overleaf.com serves them.
 *
 * Routes and shapes follow what the open-source editor sends (`threads-context.tsx`,
 * `ranges-context.tsx`, `fetch-json.ts`): a CSRF token from the project page's
 * `ol-csrfToken` meta tag must come back as `X-Csrf-Token` on anything that changes state,
 * and an unrecognised session is redirected to the login page.
 */

export interface FakeThreadMessage {
  id: string;
  content: string;
  timestamp: number;
  user_id: string;
  user: { id: string; name: string; email: string };
}

export interface FakeThread {
  messages: FakeThreadMessage[];
  resolved?: boolean;
  resolved_at?: string;
  resolved_by_user_id?: string;
  resolved_by_user?: { id: string; name: string; email: string };
}

export interface RecordedWebRequest {
  readonly method: string;
  readonly path: string;
  readonly csrfToken: string | undefined;
}

const CSRF_TOKEN = "fake-csrf-token-1";

export class FakeOverleafWeb {
  readonly threads = new Map<string, FakeThread>();
  readonly requests: RecordedWebRequest[] = [];
  /** Set by a test to answer every request the way Overleaf answers a signed-out session. */
  sessionExpired = false;
  private nextMessageId = 0;
  private acceptedCsrfToken = CSRF_TOKEN;

  /** The dashboard, compile and download routes. */
  readonly account: FakeOverleafAccount;

  constructor(
    private readonly realtime: FakeOverleafRealtime,
    private readonly sessionCookieName: string,
  ) {
    this.account = new FakeOverleafAccount(realtime);
  }

  get csrfToken(): string {
    return this.acceptedCsrfToken;
  }

  /** What signing out and back in does: the old token stops working, the page carries a new one. */
  rotateCsrfToken(): void {
    this.acceptedCsrfToken = `fake-csrf-token-${Number(this.acceptedCsrfToken.split("-").pop()) + 1}`;
  }

  /** Seeds a thread as a collaborator would have left it. */
  addThread(threadId: string, messages: Array<{ author: string; content: string }>, resolved = false): void {
    const thread: FakeThread = {
      messages: messages.map((message) => this.buildMessage(message.author, message.content)),
    };
    if (resolved) this.markResolved(thread);
    this.threads.set(threadId, thread);
  }

  handle(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method ?? "GET";
    const csrfToken =
      typeof request.headers["x-csrf-token"] === "string" ? request.headers["x-csrf-token"] : undefined;
    this.requests.push({ method, path: url.pathname, csrfToken });

    if (this.sessionExpired || !request.headers.cookie?.includes(`${this.sessionCookieName}=`)) {
      response.writeHead(302, { location: "/login" }).end();
      return;
    }
    if (method !== "GET" && csrfToken !== this.acceptedCsrfToken) {
      response
        .writeHead(403, { "content-type": "application/json" })
        .end(JSON.stringify({ message: "invalid csrf token" }));
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const answer =
        this.account.route(method, url.pathname, url.search.slice(1), body) ??
        this.route(method, url.pathname, body);
      response.writeHead(answer.status, answer.contentType ? { "content-type": answer.contentType } : {});
      response.end(answer.body);
    });
  }

  private route(method: string, path: string, body: string): FakeAnswer {
    const projectPrefix = `/project/${this.realtime.projectId}`;
    if (method === "GET" && path === "/project") return this.projectPage();
    if (!path.startsWith(projectPrefix)) return NOT_FOUND;
    const rest = path.slice(projectPrefix.length);

    if (method === "GET" && rest === "/threads") return jsonAnswer(Object.fromEntries(this.threads));

    const messageMatch = /^\/thread\/([0-9a-f]{24})\/messages$/.exec(rest);
    if (method === "POST" && messageMatch?.[1]) return this.postMessage(messageMatch[1], body);

    const threadStateMatch = /^\/doc\/([^/]+)\/thread\/([0-9a-f]{24})(?:\/(resolve|reopen))?$/.exec(rest);
    if (threadStateMatch?.[1] && threadStateMatch[2]) {
      const [, documentId, threadId, action] = threadStateMatch;
      return this.changeThread(method, documentId, threadId, action);
    }

    const acceptMatch = /^\/doc\/([^/]+)\/changes\/accept$/.exec(rest);
    if (method === "POST" && acceptMatch?.[1]) return this.acceptChanges(acceptMatch[1], body);

    return NOT_FOUND;
  }

  private projectPage(): FakeAnswer {
    return {
      status: 200,
      contentType: "text/html",
      body: `<!DOCTYPE html><html><head><meta name="ol-csrfToken" content="${this.acceptedCsrfToken}"><meta name="ol-user_id" content="${this.realtime.userId}"></head><body></body></html>`,
    };
  }

  private postMessage(threadId: string, body: string): FakeAnswer {
    const content = (JSON.parse(body || "{}") as { content?: unknown }).content;
    if (typeof content !== "string" || content.length === 0) return { status: 400 };
    const thread = this.threads.get(threadId) ?? { messages: [] };
    thread.messages.push(this.buildMessage("You", content));
    this.threads.set(threadId, thread);
    return NO_CONTENT;
  }

  private changeThread(
    method: string,
    documentId: string,
    threadId: string,
    action: string | undefined,
  ): FakeAnswer {
    const thread = this.threads.get(threadId);
    if (!thread || !this.realtime.hasDocument(documentId)) return NOT_FOUND;
    if (method === "POST" && action === "resolve") {
      this.markResolved(thread);
      return NO_CONTENT;
    }
    if (method === "POST" && action === "reopen") {
      delete thread.resolved;
      delete thread.resolved_at;
      delete thread.resolved_by_user_id;
      delete thread.resolved_by_user;
      return NO_CONTENT;
    }
    if (method === "DELETE" && action === undefined) {
      this.threads.delete(threadId);
      this.realtime.removeComment(documentId, threadId);
      return NO_CONTENT;
    }
    return NOT_FOUND;
  }

  private acceptChanges(documentId: string, body: string): FakeAnswer {
    if (!this.realtime.hasDocument(documentId)) return NOT_FOUND;
    const changeIds = (JSON.parse(body || "{}") as { change_ids?: unknown }).change_ids;
    if (!Array.isArray(changeIds)) return { status: 400 };
    this.realtime.acceptChanges(documentId, changeIds.map(String));
    return NO_CONTENT;
  }

  private buildMessage(author: string, content: string): FakeThreadMessage {
    this.nextMessageId += 1;
    const userId = author === "You" ? this.realtime.userId : "6500000000000000000000bb";
    return {
      id: `message-${this.nextMessageId}`,
      content,
      timestamp: Date.UTC(2026, 10, 1, 12, this.nextMessageId),
      user_id: userId,
      user: { id: userId, name: author, email: `${author.toLowerCase()}@example.com` },
    };
  }

  private markResolved(thread: FakeThread): void {
    thread.resolved = true;
    thread.resolved_at = "2026-11-02T09:00:00.000Z";
    thread.resolved_by_user_id = this.realtime.userId;
    thread.resolved_by_user = { id: this.realtime.userId, name: "You", email: "you@example.com" };
  }
}
