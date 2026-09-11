import { randomBytes } from "node:crypto";

import { type OverleafProjectTree, readProjectTree } from "./overleafProjectDocuments.js";
import {
  RealtimeCallError,
  RealtimeConnectionError,
  SocketIoZeroNineClient,
} from "./socketIoZeroNineClient.js";
import { type DocumentRanges, readDocumentRanges } from "./trackedChangeRanges.js";

/**
 * One live editor session against an Overleaf project, expressed as the handful of calls this
 * server needs rather than the whole real-time surface.
 *
 * Joining a project is not something the client asks for. Overleaf does it automatically from
 * the `projectId` in the connection query and pushes either `joinProjectResponse` or
 * `connectionRejected`, so opening a session means connecting and then waiting for whichever
 * of those arrives.
 */

export interface OverleafRealtimeSessionOptions {
  readonly baseUrl: string;
  readonly cookieHeader: string;
  readonly overleafProjectId: string;
  readonly connectTimeoutMs?: number;
  readonly callTimeoutMs?: number;
}

export interface JoinedDocument {
  readonly documentId: string;
  readonly lines: readonly string[];
  readonly version: number;
  readonly ranges: DocumentRanges;
}

/** An operation in Overleaf's own vocabulary: position, plus what happens there. */
export type DocumentOperation =
  | { readonly p: number; readonly i: string }
  | { readonly p: number; readonly d: string }
  | { readonly p: number; readonly c: string; readonly t: string };

const PROJECT_JOIN_TIMEOUT_MS = 30_000;
const UPDATE_APPLIED_TIMEOUT_MS = 30_000;

/**
 * `joinDoc` always escapes the document text, whatever the client asked for: the real-time
 * service runs `unescape(encodeURIComponent(line))` on every line so the old protocol could
 * carry it. Each character of the result is one UTF-8 byte, so reading those bytes back as
 * UTF-8 restores the original. Without this, every accented or non-Latin character in a paper
 * comes back mangled.
 */
function decodeEscapedLine(line: string): string {
  return Buffer.from(line, "latin1").toString("utf8");
}

/**
 * Overleaf builds a change id by appending a six-digit hexadecimal counter to this seed, so an
 * eighteen-character seed yields the twenty-four character ids the rest of Overleaf expects.
 * A fresh seed per update keeps two suggestions from colliding.
 */
export function generateTrackedChangeIdSeed(): string {
  return randomBytes(9).toString("hex");
}

export class OverleafRealtimeSession {
  private readonly client: SocketIoZeroNineClient;
  private readonly joinedDocumentIds = new Set<string>();

  private constructor(
    client: SocketIoZeroNineClient,
    readonly project: OverleafProjectTree,
    readonly permissionsLevel: string,
  ) {
    this.client = client;
  }

  static async open(options: OverleafRealtimeSessionOptions): Promise<OverleafRealtimeSession> {
    const client = await SocketIoZeroNineClient.connect({
      baseUrl: options.baseUrl,
      cookieHeader: options.cookieHeader,
      query: { projectId: options.overleafProjectId },
      connectTimeoutMs: options.connectTimeoutMs,
      callTimeoutMs: options.callTimeoutMs,
    });
    try {
      const joined = await waitForProjectJoin(client, options.connectTimeoutMs ?? PROJECT_JOIN_TIMEOUT_MS);
      return new OverleafRealtimeSession(client, joined.project, joined.permissionsLevel);
    } catch (error) {
      client.close();
      throw error;
    }
  }

  /** Reading a document is also what subscribes this session to its updates. */
  async joinDocument(documentId: string): Promise<JoinedDocument> {
    // `encodeRanges` is deliberately omitted so suggestions and comment anchors arrive as
    // ordinary text; only the document lines are escaped unconditionally.
    const answer = await this.client.callRemote("joinDoc", [documentId, -1, { supportsHistoryOT: false }]);
    this.joinedDocumentIds.add(documentId);
    const [rawLines, rawVersion, , rawRanges] = answer;
    const lines = (Array.isArray(rawLines) ? rawLines : [])
      .filter((line): line is string => typeof line === "string")
      .map(decodeEscapedLine);
    return {
      documentId,
      lines,
      version: typeof rawVersion === "number" ? rawVersion : 0,
      ranges: readDocumentRanges(rawRanges),
    };
  }

  /**
   * Sends operations and waits for Overleaf to say it applied them, not merely that it queued
   * them. The acknowledgement of `applyOtUpdate` means the update reached the queue; the
   * `otUpdateApplied` event is what says the paper actually changed.
   */
  async applyOperations(
    documentId: string,
    version: number,
    operations: readonly DocumentOperation[],
    trackedChangeIdSeed?: string,
  ): Promise<number> {
    if (operations.length === 0) return version;
    if (!this.joinedDocumentIds.has(documentId)) {
      throw new RealtimeCallError(
        "This document has not been opened in this session, so Overleaf will not accept an update for it.",
        "applyOtUpdate",
      );
    }
    const update: Record<string, unknown> = { doc: documentId, op: operations, v: version };
    if (trackedChangeIdSeed) update.meta = { tc: trackedChangeIdSeed };

    const applied = this.waitForUpdateApplied(documentId, version);
    await this.client.callRemote("applyOtUpdate", [documentId, update]);
    return await applied;
  }

  private waitForUpdateApplied(documentId: string, submittedVersion: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const stopListening = () => {
        clearTimeout(timer);
        this.client.offEvent("otUpdateApplied", onApplied);
        this.client.offEvent("otUpdateError", onFailed);
      };
      const onApplied = (args: readonly unknown[]) => {
        const update = args[0];
        if (!update || typeof update !== "object") return;
        const candidate = update as { doc?: unknown; v?: unknown };
        if (candidate.doc !== documentId) return;
        if (typeof candidate.v !== "number" || candidate.v < submittedVersion) return;
        stopListening();
        resolve(candidate.v + 1);
      };
      const onFailed = (args: readonly unknown[]) => {
        stopListening();
        const message = typeof args[0] === "string" ? args[0] : "Overleaf rejected the update.";
        reject(new RealtimeCallError(message, "applyOtUpdate"));
      };
      const timer = setTimeout(() => {
        stopListening();
        reject(
          new RealtimeCallError(
            "Overleaf accepted the update but never confirmed it was applied.",
            "applyOtUpdate",
          ),
        );
      }, UPDATE_APPLIED_TIMEOUT_MS);
      this.client.onEvent("otUpdateApplied", onApplied);
      this.client.onEvent("otUpdateError", onFailed);
    });
  }

  close(): void {
    this.client.close();
  }
}

interface ProjectJoin {
  readonly project: OverleafProjectTree;
  readonly permissionsLevel: string;
}

function describeRejection(payload: unknown): RealtimeConnectionError {
  const message =
    payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string"
      ? (payload as { message: string }).message
      : "Overleaf refused the connection to this project.";
  // `Router.js` sends exactly this text when the session key does not resolve to a session.
  // Anything else is a decision about the project, so it is reported as Overleaf worded it.
  if (/invalid session/i.test(message)) {
    return new RealtimeConnectionError(
      "Overleaf did not accept the session cookie.",
      "Copy a fresh session cookie from a browser where you are signed in. Cookies stop working when you sign out, change your password, or after they expire.",
    );
  }
  return new RealtimeConnectionError(message, "Check that this account can open the project in Overleaf.");
}

function waitForProjectJoin(client: SocketIoZeroNineClient, timeoutMs: number): Promise<ProjectJoin> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new RealtimeConnectionError(
          "Overleaf opened the connection but never described the project.",
          "This usually means the project id is not one this account can open.",
        ),
      );
    }, timeoutMs);
    client.onEvent("connectionRejected", (args) => {
      clearTimeout(timer);
      reject(describeRejection(args[0]));
    });
    client.onEvent("joinProjectResponse", (args) => {
      clearTimeout(timer);
      const payload = args[0];
      const body = (payload ?? {}) as { project?: unknown; permissionsLevel?: unknown };
      const project = readProjectTree(body.project);
      if (!project) {
        reject(new RealtimeConnectionError("Overleaf's description of the project was not readable."));
        return;
      }
      resolve({
        project,
        permissionsLevel: typeof body.permissionsLevel === "string" ? body.permissionsLevel : "unknown",
      });
    });
  });
}
