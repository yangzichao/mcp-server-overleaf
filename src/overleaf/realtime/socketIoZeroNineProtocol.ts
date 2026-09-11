/**
 * The wire format of Socket.IO 0.9, which is what Overleaf's real-time service still speaks.
 *
 * `services/real-time/package.json` pins `github:overleaf/socket.io#0.9.19-overleaf-12`, a fork
 * of a protocol that predates the `socket.io` package now on npm and is not wire-compatible
 * with it. Rather than depend on a browser-targeted client from a git URL, which this project's
 * reproducible-build and SBOM checks cannot pin, the format is implemented here. It is small:
 * one line of text per packet, and only four of the nine packet types matter to a client that
 * makes remote calls and listens for events.
 *
 * Encoding follows `lib/parser.js` of overleaf/socket.io-client at 0.9.17-overleaf-5.
 */

/** Index into the packet type table; the wire carries the number, not the name. */
const PACKET_TYPE_NAMES = [
  "disconnect",
  "connect",
  "heartbeat",
  "message",
  "json",
  "event",
  "ack",
  "error",
  "noop",
] as const;

export type SocketIoPacketTypeName = (typeof PACKET_TYPE_NAMES)[number];

export interface SocketIoHeartbeatPacket {
  readonly type: "heartbeat";
}

export interface SocketIoDisconnectPacket {
  readonly type: "disconnect";
}

export interface SocketIoConnectPacket {
  readonly type: "connect";
}

export interface SocketIoNoopPacket {
  readonly type: "noop";
}

export interface SocketIoErrorPacket {
  readonly type: "error";
  readonly reason: string;
  readonly advice: string;
}

export interface SocketIoEventPacket {
  readonly type: "event";
  readonly name: string;
  readonly args: readonly unknown[];
  /** Present when the sender wants a reply; the reply carries the same id. */
  readonly acknowledgementId?: number;
}

export interface SocketIoAcknowledgementPacket {
  readonly type: "ack";
  readonly acknowledgementId: number;
  readonly args: readonly unknown[];
}

export type SocketIoPacket =
  | SocketIoHeartbeatPacket
  | SocketIoDisconnectPacket
  | SocketIoConnectPacket
  | SocketIoNoopPacket
  | SocketIoErrorPacket
  | SocketIoEventPacket
  | SocketIoAcknowledgementPacket;

/**
 * Separates packets when several share one frame. The 0.9 payload format wraps each packet
 * as U+FFFD, its length, U+FFFD, then the packet itself.
 */
const PAYLOAD_DELIMITER = "�";

const ERROR_REASON_NAMES = ["transport not supported", "client not handshaken", "unauthorized"];
const ERROR_ADVICE_NAMES = ["reconnect"];

function packetTypeIndex(name: SocketIoPacketTypeName): number {
  return PACKET_TYPE_NAMES.indexOf(name);
}

/**
 * An event that expects a reply is encoded with the acknowledgement id in the second field
 * and a trailing `+`, which is what tells the server to answer with data rather than a bare
 * receipt. `namespace.js` in the 0.9 client sets `packet.ack = "data"` exactly when the caller
 * passed a callback, so a remote call and a fire-and-forget event differ only by that `+`.
 */
export function encodeSocketIoEvent(
  name: string,
  args: readonly unknown[],
  acknowledgementId?: number,
): string {
  const identifierField = acknowledgementId === undefined ? "" : `${acknowledgementId}+`;
  const payload = args.length > 0 ? JSON.stringify({ name, args }) : JSON.stringify({ name });
  return `${packetTypeIndex("event")}:${identifierField}::${payload}`;
}

export function encodeSocketIoHeartbeat(): string {
  return `${packetTypeIndex("heartbeat")}::`;
}

export function encodeSocketIoDisconnect(): string {
  return `${packetTypeIndex("disconnect")}::`;
}

/** Mirrors the `regexp` in the 0.9 parser, including its optional fields. */
const PACKET_PATTERN = /^([^:]+):([0-9]+)?(\+)?:([^:]*)?:?([\s\S]*)?$/;

function decodeEventPacket(data: string, acknowledgementId?: number): SocketIoPacket {
  let name = "";
  let args: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === "object" && "name" in parsed) {
      const candidate = parsed as { name?: unknown; args?: unknown };
      name = typeof candidate.name === "string" ? candidate.name : "";
      args = Array.isArray(candidate.args) ? candidate.args : [];
    }
  } catch {
    // The 0.9 parser also swallows malformed event payloads, leaving an empty argument list.
  }
  return acknowledgementId === undefined
    ? { type: "event", name, args }
    : { type: "event", name, args, acknowledgementId };
}

function decodeAcknowledgementPacket(data: string): SocketIoPacket | undefined {
  const pieces = data.match(/^([0-9]+)(\+)?([\s\S]*)$/);
  if (!pieces) return undefined;
  let args: unknown[] = [];
  if (pieces[3]) {
    try {
      const parsed: unknown = JSON.parse(pieces[3]);
      if (Array.isArray(parsed)) args = parsed;
    } catch {
      // As above: an unreadable acknowledgement body becomes no arguments rather than a throw.
    }
  }
  return { type: "ack", acknowledgementId: Number(pieces[1]), args };
}

/** Undefined for anything this client has no use for, so callers need no default branch. */
export function decodeSocketIoPacket(frame: string): SocketIoPacket | undefined {
  const pieces = frame.match(PACKET_PATTERN);
  if (!pieces) return undefined;
  const type = PACKET_TYPE_NAMES[Number(pieces[1])];
  const data = pieces[5] ?? "";
  switch (type) {
    case "event":
      return decodeEventPacket(data, pieces[2] ? Number(pieces[2]) : undefined);
    case "ack":
      return decodeAcknowledgementPacket(data);
    case "error": {
      const [reasonIndex, adviceIndex] = data.split("+");
      return {
        type: "error",
        reason: ERROR_REASON_NAMES[Number(reasonIndex)] ?? "",
        advice: ERROR_ADVICE_NAMES[Number(adviceIndex)] ?? "",
      };
    }
    case "heartbeat":
    case "disconnect":
    case "connect":
    case "noop":
      return { type };
    default:
      return undefined;
  }
}

/**
 * One frame can carry several packets. Overleaf batches applied operations this way, so a
 * client that reads only the first packet of a frame silently loses a co-author's edits.
 */
export function decodeSocketIoFrame(frame: string): SocketIoPacket[] {
  if (!frame.startsWith(PAYLOAD_DELIMITER)) {
    const single = decodeSocketIoPacket(frame);
    return single ? [single] : [];
  }
  const packets: SocketIoPacket[] = [];
  let cursor = 1;
  while (cursor < frame.length) {
    const lengthEnd = frame.indexOf(PAYLOAD_DELIMITER, cursor);
    if (lengthEnd === -1) break;
    const length = Number(frame.slice(cursor, lengthEnd));
    if (!Number.isFinite(length)) break;
    const packet = decodeSocketIoPacket(frame.slice(lengthEnd + 1, lengthEnd + 1 + length));
    if (packet) packets.push(packet);
    cursor = lengthEnd + 1 + length;
  }
  return packets;
}

export interface SocketIoHandshake {
  readonly sessionId: string;
  readonly heartbeatTimeoutSeconds: number | undefined;
  readonly closeTimeoutSeconds: number | undefined;
  readonly transports: readonly string[];
}

/**
 * The handshake body is four colon-separated fields rather than JSON. An empty heartbeat or
 * close field means the server never times the connection out, which is why both are optional
 * here instead of defaulted to zero.
 */
export function parseSocketIoHandshake(body: string): SocketIoHandshake | undefined {
  const [sessionId, heartbeat, close, transports] = body.trim().split(":");
  if (!sessionId) return undefined;
  const toSeconds = (field: string | undefined): number | undefined => {
    if (!field) return undefined;
    const value = Number(field);
    return Number.isFinite(value) ? value : undefined;
  };
  return {
    sessionId,
    heartbeatTimeoutSeconds: toSeconds(heartbeat),
    closeTimeoutSeconds: toSeconds(close),
    transports: transports ? transports.split(",") : [],
  };
}
