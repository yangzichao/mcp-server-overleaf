import {
  decodeSocketIoFrame,
  encodeSocketIoDisconnect,
  encodeSocketIoEvent,
  encodeSocketIoHeartbeat,
  parseSocketIoHandshake,
} from "./socketIoZeroNineProtocol.js";

/**
 * A Socket.IO 0.9 connection, which is what Overleaf's real-time service accepts.
 *
 * The transport is the WebSocket built into Node. Its `headers` option is what carries the
 * Overleaf session cookie through the upgrade request, and it exists from undici 6.21.1, the
 * version Node 22.14.0 bundles. That is this package's declared engine floor, so no separate
 * WebSocket library is needed.
 *
 * This class knows nothing about papers or Overleaf; it connects, makes remote calls that
 * resolve when the server acknowledges them, and delivers events. The Overleaf meaning of
 * those calls lives in `overleafRealtimeSession.ts`.
 */

export class RealtimeConnectionError extends Error {
  constructor(
    message: string,
    /** What the user can do about it, kept separate so tools can present it on its own line. */
    readonly remedy?: string,
  ) {
    super(message);
    this.name = "RealtimeConnectionError";
  }
}

/** Rejections from a remote call carry Overleaf's own message, which is worth showing verbatim. */
export class RealtimeCallError extends Error {
  constructor(
    message: string,
    readonly callName: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RealtimeCallError";
  }
}

export interface SocketIoConnectionOptions {
  /** Origin of the Overleaf instance, for example `https://www.overleaf.com`. */
  readonly baseUrl: string;
  /** A complete Cookie header value, for example `overleaf_session2=s%3A...`. */
  readonly cookieHeader: string;
  /** Appended to both the handshake and the socket URL; Overleaf reads `projectId` here. */
  readonly query: Readonly<Record<string, string>>;
  readonly connectTimeoutMs?: number;
  readonly callTimeoutMs?: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_CALL_TIMEOUT_MS = 30_000;

interface PendingCall {
  readonly name: string;
  readonly resolve: (args: readonly unknown[]) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

function describeHandshakeFailure(status: number): RealtimeConnectionError {
  if (status === 401 || status === 403) {
    return new RealtimeConnectionError(
      "Overleaf did not accept the session cookie.",
      "Sign in to Overleaf in a browser and copy a fresh session cookie. Cookies stop working when you sign out, change your password, or after they expire.",
    );
  }
  if (status === 404) {
    return new RealtimeConnectionError(
      "This Overleaf instance has no real-time endpoint at /socket.io.",
      "Check the instance address. Self-hosted installations behind a proxy sometimes do not forward /socket.io.",
    );
  }
  return new RealtimeConnectionError(`Overleaf refused the real-time handshake with status ${status}.`);
}

function toWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.origin;
}

export class SocketIoZeroNineClient {
  private readonly socket: WebSocket;
  private readonly callTimeoutMs: number;
  private readonly pendingCalls = new Map<number, PendingCall>();
  private readonly eventListeners = new Map<string, Array<(args: readonly unknown[]) => void>>();
  /**
   * Overleaf pushes `joinProjectResponse` the instant the socket opens, before any caller can
   * have asked for it. An event with no listener is therefore kept rather than dropped, and
   * handed to the first listener that asks for it.
   */
  private readonly unclaimedEvents = new Map<string, Array<readonly unknown[]>>();
  private nextAcknowledgementId = 0;
  private closeReason: Error | undefined;

  private constructor(socket: WebSocket, callTimeoutMs: number) {
    this.socket = socket;
    this.callTimeoutMs = callTimeoutMs;
    socket.addEventListener("message", (event) => this.receiveFrame(String(event.data)));
    socket.addEventListener("close", () => {
      this.failEveryPendingCall(
        this.closeReason ?? new RealtimeConnectionError("The Overleaf real-time connection closed."),
      );
    });
  }

  /**
   * Overleaf's handshake is an ordinary HTTP GET that returns a session id, so an expired
   * cookie is refused here rather than inside an opaque socket failure.
   */
  static async connect(options: SocketIoConnectionOptions): Promise<SocketIoZeroNineClient> {
    const query = new URLSearchParams(options.query);
    const origin = new URL(options.baseUrl).origin;
    const handshakeUrl = `${origin}/socket.io/1/?t=${Date.now()}&${query.toString()}`;
    const response = await fetch(handshakeUrl, {
      headers: { cookie: options.cookieHeader },
      signal: AbortSignal.timeout(options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS),
      redirect: "manual",
    });
    if (!response.ok) throw describeHandshakeFailure(response.status);
    const handshake = parseSocketIoHandshake(await response.text());
    if (!handshake) {
      throw new RealtimeConnectionError(
        "Overleaf's real-time handshake was not in the expected format.",
        "The address may be reaching something other than Overleaf.",
      );
    }

    const socketUrl = `${toWebSocketUrl(options.baseUrl)}/socket.io/1/websocket/${handshake.sessionId}?${query.toString()}`;
    const socket = new WebSocket(socketUrl, { headers: { cookie: options.cookieHeader } });
    const client = new SocketIoZeroNineClient(socket, options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS);
    await client.waitForConnectPacket(options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS);
    return client;
  }

  private waitForConnectPacket(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        settle(new RealtimeConnectionError("Overleaf accepted the handshake but never opened the socket."));
      }, timeoutMs);
      const settle = (error?: Error) => {
        clearTimeout(timer);
        this.socket.removeEventListener("error", onError);
        this.socket.removeEventListener("close", onClose);
        this.eventListeners.delete(CONNECT_SENTINEL);
        if (error) {
          this.closeReason ??= error;
          try {
            this.socket.close();
          } catch {
            // Closing a socket that never opened is not a failure worth reporting.
          }
          reject(error);
        } else {
          resolve();
        }
      };
      const onError = () =>
        settle(new RealtimeConnectionError("Could not open the Overleaf real-time socket."));
      const onClose = () =>
        settle(
          this.closeReason ??
            new RealtimeConnectionError("Overleaf closed the real-time socket during connection."),
        );
      this.socket.addEventListener("error", onError);
      this.socket.addEventListener("close", onClose);
      this.onEvent(CONNECT_SENTINEL, () => settle());
    });
  }

  /**
   * Resolves with the acknowledgement arguments. Overleaf answers in the Node convention,
   * so a non-null first argument is the failure and is turned into a rejection here rather
   * than handed to every caller to check.
   */
  callRemote(name: string, args: readonly unknown[]): Promise<readonly unknown[]> {
    if (this.closeReason) return Promise.reject(this.closeReason);
    const acknowledgementId = ++this.nextAcknowledgementId;
    return new Promise<readonly unknown[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(acknowledgementId);
        reject(new RealtimeCallError(`Overleaf did not answer ${name} in time.`, name));
      }, this.callTimeoutMs);
      this.pendingCalls.set(acknowledgementId, { name, resolve, reject, timer });
      this.sendFrame(encodeSocketIoEvent(name, args, acknowledgementId));
    });
  }

  /** For calls Overleaf does not acknowledge, such as leaving a project on the way out. */
  emitEvent(name: string, args: readonly unknown[]): void {
    this.sendFrame(encodeSocketIoEvent(name, args));
  }

  onEvent(name: string, listener: (args: readonly unknown[]) => void): void {
    const existing = this.eventListeners.get(name);
    if (existing) existing.push(listener);
    else this.eventListeners.set(name, [listener]);
    const kept = this.unclaimedEvents.get(name);
    if (!kept) return;
    this.unclaimedEvents.delete(name);
    for (const args of kept) listener(args);
  }

  /** Long sessions apply many updates, so each one's listener has to go when it is done. */
  offEvent(name: string, listener: (args: readonly unknown[]) => void): void {
    const listeners = this.eventListeners.get(name);
    if (!listeners) return;
    const position = listeners.indexOf(listener);
    if (position >= 0) listeners.splice(position, 1);
  }

  close(): void {
    this.closeReason ??= new RealtimeConnectionError("The Overleaf real-time connection was closed.");
    try {
      if (this.socket.readyState === WebSocket.OPEN) this.sendFrame(encodeSocketIoDisconnect());
      this.socket.close();
    } catch {
      // A socket that is already gone needs no further closing.
    }
    this.failEveryPendingCall(this.closeReason);
  }

  private sendFrame(frame: string): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(frame);
  }

  private receiveFrame(frame: string): void {
    for (const packet of decodeSocketIoFrame(frame)) {
      switch (packet.type) {
        case "heartbeat":
          this.sendFrame(encodeSocketIoHeartbeat());
          break;
        case "connect":
          this.deliverEvent(CONNECT_SENTINEL, []);
          break;
        case "ack":
          this.settleCall(packet.acknowledgementId, packet.args);
          break;
        case "event":
          this.deliverEvent(packet.name, packet.args);
          break;
        case "error":
          this.closeReason = new RealtimeConnectionError(
            `Overleaf rejected the real-time connection: ${packet.reason || "unspecified"}.`,
            packet.reason === "unauthorized" ? "Copy a fresh Overleaf session cookie." : undefined,
          );
          this.failEveryPendingCall(this.closeReason);
          break;
        case "disconnect":
          this.closeReason ??= new RealtimeConnectionError("Overleaf closed the real-time connection.");
          this.failEveryPendingCall(this.closeReason);
          break;
        default:
          break;
      }
    }
  }

  private settleCall(acknowledgementId: number, args: readonly unknown[]): void {
    const pending = this.pendingCalls.get(acknowledgementId);
    if (!pending) return;
    this.pendingCalls.delete(acknowledgementId);
    clearTimeout(pending.timer);
    const [failure, ...rest] = args;
    if (failure === null || failure === undefined) {
      pending.resolve(rest);
      return;
    }
    pending.reject(toCallError(failure, pending.name));
  }

  private deliverEvent(name: string, args: readonly unknown[]): void {
    const listeners = this.eventListeners.get(name);
    if (!listeners || listeners.length === 0) {
      const kept = this.unclaimedEvents.get(name);
      if (kept) kept.push(args);
      else this.unclaimedEvents.set(name, [args]);
      return;
    }
    for (const listener of listeners) listener(args);
  }

  private failEveryPendingCall(error: Error): void {
    for (const [id, pending] of this.pendingCalls) {
      this.pendingCalls.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}

/** Not an Overleaf event name, so it cannot collide with one the server sends. */
const CONNECT_SENTINEL = " connect";

function toCallError(failure: unknown, callName: string): RealtimeCallError {
  if (typeof failure === "string") return new RealtimeCallError(failure, callName);
  if (failure && typeof failure === "object") {
    const candidate = failure as { message?: unknown; code?: unknown };
    const message =
      typeof candidate.message === "string" ? candidate.message : `Overleaf refused ${callName}.`;
    const code = typeof candidate.code === "string" ? candidate.code : undefined;
    return new RealtimeCallError(message, callName, code);
  }
  return new RealtimeCallError(`Overleaf refused ${callName}.`, callName);
}
