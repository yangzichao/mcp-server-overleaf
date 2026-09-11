import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type WebSocket as ServerWebSocket, WebSocketServer } from "ws";

import {
  decodeSocketIoFrame,
  encodeSocketIoEvent,
} from "../../src/overleaf/realtime/socketIoZeroNineProtocol.js";

/**
 * An Overleaf real-time service standing in for the one behind overleaf.com.
 *
 * The real service cannot be used in tests: it needs a live account, a browser session cookie,
 * and a test would leave suggestions in someone's paper. This reproduces what the tracked
 * changes contract actually depends on, taken from `overleaf/overleaf`:
 *
 * - a Socket.IO 0.9 handshake over HTTP, refused with 401 when the session cookie is missing;
 * - `joinProjectResponse` pushed on connection, built like `ProjectEditorHandler`;
 * - `joinDoc` answering with lines, version and ranges, with the lines escaped the way
 *   `WebsocketController` escapes them;
 * - `applyOtUpdate` turning operations into tracked changes when `meta.tc` is present and into
 *   plain text when it is not, which is the distinction `RangesManager` makes;
 * - the review permission check `WebsocketController._assertClientCanApplyUpdate` performs.
 */

export interface FakeTrackedChange {
  id: string;
  op: { p: number; i?: string; d?: string };
  metadata: { user_id: string; ts: string };
}

export interface FakeComment {
  id: string;
  op: { c: string; p: number; t: string };
  metadata: { user_id: string; ts: string };
}

interface FakeDocument {
  readonly documentId: string;
  readonly name: string;
  text: string;
  version: number;
  changes: FakeTrackedChange[];
  comments: FakeComment[];
}

export type FakePermissionsLevel = "owner" | "readAndWrite" | "review" | "readOnly";

const SESSION_COOKIE_NAME = "overleaf_session2";

/** Mirrors `encodeForWebsockets` in `services/real-time/app/js/WebsocketController.js`. */
function escapeForWebsockets(text: string): string {
  return Buffer.from(text, "utf8").toString("latin1");
}

function nowIso(): string {
  return new Date().toISOString();
}

export class FakeOverleafRealtime {
  private readonly httpServer: Server;
  private readonly webSocketServer: WebSocketServer;
  private readonly documents = new Map<string, FakeDocument>();
  private handshakeSessionIds = new Set<string>();
  private nextHandshakeId = 0;

  /** Changed by a test to exercise the review-permission branch. */
  permissionsLevel: FakePermissionsLevel = "owner";
  /** Set by a test to make the next `applyOtUpdate` fail the way Overleaf does. */
  rejectNextUpdateWith: string | undefined;
  readonly userId = "6500000000000000000000aa";

  private constructor(
    httpServer: Server,
    webSocketServer: WebSocketServer,
    readonly projectId: string,
    readonly projectName: string,
  ) {
    this.httpServer = httpServer;
    this.webSocketServer = webSocketServer;
  }

  static async start(
    projectId = "64a1b2c3d4e5f6a7b8c9d0e1",
    projectName = "Fake paper",
  ): Promise<FakeOverleafRealtime> {
    const httpServer = createServer();
    const webSocketServer = new WebSocketServer({ noServer: true });
    const remote = new FakeOverleafRealtime(httpServer, webSocketServer, projectId, projectName);
    remote.installHandshakeRoute();
    remote.installUpgradeRoute();
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    return remote;
  }

  get baseUrl(): string {
    const { port } = this.httpServer.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  get cookieHeader(): string {
    return `${SESSION_COOKIE_NAME}=s%3Aa-signed-session-id`;
  }

  addDocument(name: string, text: string, documentId?: string): string {
    const id = documentId ?? `doc${String(this.documents.size + 1).padStart(21, "0")}`;
    this.documents.set(id, { documentId: id, name, text, version: 0, changes: [], comments: [] });
    return id;
  }

  addComment(documentId: string, quotedText: string, position: number, threadId: string): void {
    const document = this.documents.get(documentId);
    if (!document) throw new Error(`No such document: ${documentId}`);
    document.comments.push({
      id: threadId,
      op: { c: quotedText, p: position, t: threadId },
      metadata: { user_id: this.userId, ts: nowIso() },
    });
  }

  documentText(documentId: string): string {
    const document = this.documents.get(documentId);
    if (!document) throw new Error(`No such document: ${documentId}`);
    return document.text;
  }

  trackedChanges(documentId: string): readonly FakeTrackedChange[] {
    const document = this.documents.get(documentId);
    if (!document) throw new Error(`No such document: ${documentId}`);
    return document.changes;
  }

  async stop(): Promise<void> {
    for (const socket of this.webSocketServer.clients) socket.terminate();
    this.webSocketServer.close();
    await new Promise<void>((resolve) => this.httpServer.close(() => resolve()));
  }

  private installHandshakeRoute(): void {
    this.httpServer.on("request", (request, response) => {
      if (!request.url?.startsWith("/socket.io/1/?")) {
        response.writeHead(404).end();
        return;
      }
      if (!request.headers.cookie?.includes(`${SESSION_COOKIE_NAME}=`)) {
        response.writeHead(401).end();
        return;
      }
      const sessionId = `handshake-${++this.nextHandshakeId}`;
      this.handshakeSessionIds.add(sessionId);
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(`${sessionId}:60:60:websocket,xhr-polling`);
    });
  }

  private installUpgradeRoute(): void {
    this.httpServer.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const sessionId = url.pathname.split("/").pop() ?? "";
      // The real service authenticates the upgrade from the cookie, not from the handshake id.
      if (!request.headers.cookie?.includes(`${SESSION_COOKIE_NAME}=`)) {
        socket.destroy();
        return;
      }
      if (!this.handshakeSessionIds.has(sessionId)) {
        socket.destroy();
        return;
      }
      const requestedProjectId = url.searchParams.get("projectId");
      this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        this.serveConnection(webSocket, requestedProjectId);
      });
    });
  }

  private serveConnection(webSocket: ServerWebSocket, requestedProjectId: string | null): void {
    webSocket.send("1::");
    if (requestedProjectId !== this.projectId) {
      webSocket.send(
        encodeSocketIoEvent("connectionRejected", [{ message: "not authorized to open this project" }]),
      );
      webSocket.close();
      return;
    }
    webSocket.send(encodeSocketIoEvent("joinProjectResponse", [this.buildJoinProjectResponse()]));
    webSocket.on("message", (data) => this.handleFrame(webSocket, String(data)));
  }

  private buildJoinProjectResponse(): unknown {
    return {
      publicId: "public-1",
      permissionsLevel: this.permissionsLevel,
      protocolVersion: 2,
      project: {
        _id: this.projectId,
        name: this.projectName,
        rootDoc_id: [...this.documents.values()][0]?.documentId,
        rootFolder: [
          {
            _id: "root-folder",
            name: "rootFolder",
            folders: [
              {
                _id: "sections-folder",
                name: "sections",
                folders: [],
                fileRefs: [],
                docs: [...this.documents.values()]
                  .filter((document) => document.name.startsWith("sections/"))
                  .map((document) => ({
                    _id: document.documentId,
                    name: document.name.slice("sections/".length),
                  })),
              },
            ],
            fileRefs: [{ _id: "file-1", name: "figure.png" }],
            docs: [...this.documents.values()]
              .filter((document) => !document.name.includes("/"))
              .map((document) => ({ _id: document.documentId, name: document.name })),
          },
        ],
      },
    };
  }

  private handleFrame(webSocket: ServerWebSocket, frame: string): void {
    for (const packet of decodeSocketIoFrame(frame)) {
      if (packet.type === "heartbeat") {
        webSocket.send("2::");
        continue;
      }
      if (packet.type !== "event" || packet.acknowledgementId === undefined) continue;
      const acknowledgementId = packet.acknowledgementId;
      if (packet.name === "joinDoc") this.answerJoinDoc(webSocket, acknowledgementId, packet.args);
      if (packet.name === "applyOtUpdate") this.answerApplyUpdate(webSocket, acknowledgementId, packet.args);
    }
  }

  private answerJoinDoc(
    webSocket: ServerWebSocket,
    acknowledgementId: number,
    args: readonly unknown[],
  ): void {
    const document = this.documents.get(String(args[0]));
    if (!document) {
      this.sendAcknowledgement(webSocket, acknowledgementId, [{ message: "doc not found" }]);
      return;
    }
    const lines = document.text.split("\n").map(escapeForWebsockets);
    this.sendAcknowledgement(webSocket, acknowledgementId, [
      null,
      lines,
      document.version,
      [],
      { changes: document.changes, comments: document.comments },
      "sharejs-text-ot",
    ]);
  }

  private answerApplyUpdate(
    webSocket: ServerWebSocket,
    acknowledgementId: number,
    args: readonly unknown[],
  ): void {
    const document = this.documents.get(String(args[0]));
    const update = args[1] as { op?: unknown; v?: unknown; meta?: { tc?: unknown } } | undefined;
    if (!document || !update || !Array.isArray(update.op)) {
      this.sendAcknowledgement(webSocket, acknowledgementId, [{ message: "invalid update" }]);
      return;
    }
    if (this.rejectNextUpdateWith) {
      const message = this.rejectNextUpdateWith;
      this.rejectNextUpdateWith = undefined;
      this.sendAcknowledgement(webSocket, acknowledgementId, [{ message }]);
      return;
    }
    const idSeed = typeof update.meta?.tc === "string" ? update.meta.tc : undefined;
    const permissionFailure = this.checkUpdatePermission(update.op, idSeed);
    if (permissionFailure) {
      this.sendAcknowledgement(webSocket, acknowledgementId, [{ message: permissionFailure }]);
      return;
    }
    this.sendAcknowledgement(webSocket, acknowledgementId, [null]);
    this.applyOperations(document, update.op, idSeed);
    webSocket.send(
      encodeSocketIoEvent("otUpdateApplied", [{ v: document.version - 1, doc: document.documentId }]),
    );
  }

  /** The three-way check in `WebsocketController._assertClientCanApplyUpdate`. */
  private checkUpdatePermission(operations: unknown[], idSeed: string | undefined): string | undefined {
    const everyOperationIsAComment = operations.every(
      (operation) => operation && typeof operation === "object" && "c" in operation,
    );
    // A comment needs only view permission, so every level this fake models may leave one.
    if (everyOperationIsAComment) return undefined;
    // A tracked change needs review permission, which read-only access does not carry.
    if (idSeed) {
      return this.permissionsLevel === "readOnly" ? "not authorized" : undefined;
    }
    return this.permissionsLevel === "owner" || this.permissionsLevel === "readAndWrite"
      ? undefined
      : "not authorized";
  }

  private applyOperations(document: FakeDocument, operations: unknown[], idSeed: string | undefined): void {
    let idCounter = 0;
    const nextChangeId = (): string => {
      idCounter += 1;
      return `${idSeed}${idCounter.toString(16).padStart(6, "0")}`;
    };
    for (const raw of operations) {
      if (!raw || typeof raw !== "object") continue;
      const operation = raw as { p?: unknown; i?: unknown; d?: unknown; c?: unknown; t?: unknown };
      const position = typeof operation.p === "number" ? operation.p : 0;
      if (typeof operation.c === "string" && typeof operation.t === "string") {
        this.applyComment(document, position, operation.c, operation.t);
      } else if (typeof operation.i === "string") {
        this.applyInsert(document, position, operation.i, idSeed, nextChangeId);
      } else if (typeof operation.d === "string") {
        this.applyDelete(document, position, operation.d, idSeed, nextChangeId);
      }
    }
    document.version += 1;
  }

  private applyComment(document: FakeDocument, position: number, quotedText: string, threadId: string): void {
    document.comments.push({
      id: threadId,
      op: { c: quotedText, p: position, t: threadId },
      metadata: { user_id: this.userId, ts: nowIso() },
    });
  }

  private applyInsert(
    document: FakeDocument,
    position: number,
    text: string,
    idSeed: string | undefined,
    nextChangeId: () => string,
  ): void {
    document.text = document.text.slice(0, position) + text + document.text.slice(position);
    if (!idSeed) return;
    document.changes.push({
      id: nextChangeId(),
      op: { p: position, i: text },
      metadata: { user_id: this.userId, ts: nowIso() },
    });
  }

  private applyDelete(
    document: FakeDocument,
    position: number,
    text: string,
    idSeed: string | undefined,
    nextChangeId: () => string,
  ): void {
    // The real doc-updater refuses a delete whose text does not match the document, which is
    // what turns a miscalculated offset into a failure rather than a silent corruption.
    const found = document.text.slice(position, position + text.length);
    if (found !== text) {
      throw new Error(
        `Delete at ${position} expected ${JSON.stringify(text)} but the document has ${JSON.stringify(found)}`,
      );
    }
    // A tracked delete still takes the text out of the document; `applyDeleteToChanges` in
    // ranges-tracker shifts every later change back by the deleted length, which it could not
    // do if the text were still there. What the range keeps is the original text, so rejecting
    // the suggestion can put it back.
    document.text = document.text.slice(0, position) + document.text.slice(position + text.length);
    if (!idSeed) return;
    document.changes.push({
      id: nextChangeId(),
      op: { p: position, d: text },
      metadata: { user_id: this.userId, ts: nowIso() },
    });
  }

  private sendAcknowledgement(
    webSocket: ServerWebSocket,
    acknowledgementId: number,
    args: readonly unknown[],
  ): void {
    webSocket.send(`6:::${acknowledgementId}+${JSON.stringify(args)}`);
  }
}
