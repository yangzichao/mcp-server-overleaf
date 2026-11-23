import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  decodeSocketIoFrame,
  decodeSocketIoPacket,
  encodeSocketIoDisconnect,
  encodeSocketIoEvent,
  encodeSocketIoHeartbeat,
  parseSocketIoHandshake,
} from "../../../../src/overleaf/realtime/socketIoZeroNineProtocol.js";

const PAYLOAD_DELIMITER = "�";

const eventName = fc.oneof(
  fc.constantFrom("joinDoc", "applyOtUpdate", "otUpdateApplied", "a:b", "", "北京", "😀", "�", "\n"),
  fc.string(),
);
const eventArguments = fc.array(fc.jsonValue(), { maxLength: 4 });
const acknowledgementId = fc.option(fc.nat({ max: 1_000_000 }), { nil: undefined });

function asSentOverTheWire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function wrapAsPayload(packets: readonly string[]): string {
  return packets
    .map((packet) => `${PAYLOAD_DELIMITER}${packet.length}${PAYLOAD_DELIMITER}${packet}`)
    .join("");
}

const encodedPacket = fc.oneof(
  fc
    .tuple(eventName, eventArguments, acknowledgementId)
    .map(([name, args, id]) => encodeSocketIoEvent(name, args, id)),
  fc.constant(encodeSocketIoHeartbeat()),
  fc.constant(encodeSocketIoDisconnect()),
  fc.tuple(fc.nat({ max: 1000 }), eventArguments).map(([id, args]) => `6:::${id}+${JSON.stringify(args)}`),
);

describe("socket.io 0.9 packet properties", () => {
  it("decodes an encoded event back to its name, its arguments as JSON carries them, and its id", () => {
    fc.assert(
      fc.property(eventName, eventArguments, acknowledgementId, (name, args, id) => {
        const expected =
          id === undefined
            ? { type: "event", name, args }
            : { type: "event", name, args, acknowledgementId: id };
        expect(decodeSocketIoPacket(encodeSocketIoEvent(name, args, id))).toEqual(
          asSentOverTheWire(expected),
        );
      }),
    );
  });

  it("decodes an acknowledgement with its id and arguments", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), eventArguments, (id, args) => {
        expect(decodeSocketIoPacket(`6:::${id}+${JSON.stringify(args)}`)).toEqual({
          type: "ack",
          acknowledgementId: id,
          args: asSentOverTheWire(args),
        });
      }),
    );
  });

  it("never throws on an arbitrary frame and only ever returns a known packet type", () => {
    const knownTypes = ["heartbeat", "disconnect", "connect", "noop", "error", "event", "ack"];
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.tuple(fc.nat(9), fc.string()).map(([type, rest]) => `${type}:${rest}`),
          fc.tuple(fc.nat(9), fc.nat(), fc.string()).map(([type, id, rest]) => `${type}:${id}+::${rest}`),
        ),
        (frame) => {
          const packet = decodeSocketIoPacket(frame);
          if (packet !== undefined) expect(knownTypes).toContain(packet.type);
        },
      ),
    );
  });
});

describe("socket.io 0.9 frame properties", () => {
  it("reads every packet of a payload, in order, as if each had arrived alone", () => {
    fc.assert(
      fc.property(fc.array(encodedPacket, { minLength: 1, maxLength: 5 }), (packets) => {
        expect(decodeSocketIoFrame(wrapAsPayload(packets))).toEqual(
          packets.map((packet) => decodeSocketIoPacket(packet)),
        );
      }),
    );
  });

  it("keeps every packet that arrived whole when a payload is cut short", () => {
    fc.assert(
      fc.property(
        fc
          .array(encodedPacket, { minLength: 1, maxLength: 5 })
          .chain((packets) => fc.tuple(fc.constant(packets), fc.nat(wrapAsPayload(packets).length))),
        ([packets, cut]) => {
          const truncated = wrapAsPayload(packets).slice(0, cut);
          const wholePackets = packets.filter(
            (_, index) => wrapAsPayload(packets.slice(0, index + 1)).length <= cut,
          );
          const decoded = decodeSocketIoFrame(truncated);
          expect(decoded.slice(0, wholePackets.length)).toEqual(
            wholePackets.map((packet) => decodeSocketIoPacket(packet)),
          );
          expect(decoded.length).toBeLessThanOrEqual(wholePackets.length + 1);
        },
      ),
    );
  });
});

describe("socket.io 0.9 handshake properties", () => {
  it("reads back the session id, timeouts and transports it was given", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9_-]{1,20}$/),
        fc.option(fc.nat({ max: 600 }), { nil: undefined }),
        fc.option(fc.nat({ max: 600 }), { nil: undefined }),
        fc.array(fc.constantFrom("websocket", "xhr-polling", "jsonp-polling"), { maxLength: 3 }),
        (sessionId, heartbeat, close, transports) => {
          const body = `${sessionId}:${heartbeat ?? ""}:${close ?? ""}:${transports.join(",")}`;
          expect(parseSocketIoHandshake(`${body}\n`)).toEqual({
            sessionId,
            heartbeatTimeoutSeconds: heartbeat,
            closeTimeoutSeconds: close,
            transports,
          });
        },
      ),
    );
  });

  it("never throws on an arbitrary body", () => {
    fc.assert(
      fc.property(fc.string(), (body) => {
        const handshake = parseSocketIoHandshake(body);
        if (handshake !== undefined) expect(handshake.sessionId).not.toBe("");
      }),
    );
  });
});
