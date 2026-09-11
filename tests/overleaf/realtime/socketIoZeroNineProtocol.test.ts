import { describe, expect, it } from "vitest";

import {
  decodeSocketIoFrame,
  decodeSocketIoPacket,
  encodeSocketIoDisconnect,
  encodeSocketIoEvent,
  encodeSocketIoHeartbeat,
  parseSocketIoHandshake,
} from "../../../src/overleaf/realtime/socketIoZeroNineProtocol.js";

describe("socket.io 0.9 encoding", () => {
  it("encodes an event that wants no reply without an acknowledgement id", () => {
    expect(encodeSocketIoEvent("clientTracking.updatePosition", [{ row: 1 }])).toBe(
      '5:::{"name":"clientTracking.updatePosition","args":[{"row":1}]}',
    );
  });

  it("marks an event that wants a reply with the id and a trailing plus", () => {
    expect(encodeSocketIoEvent("joinDoc", ["abc", -1, {}], 1)).toBe(
      '5:1+::{"name":"joinDoc","args":["abc",-1,{}]}',
    );
  });

  it("omits the argument list when there is none, as the 0.9 client does", () => {
    expect(encodeSocketIoEvent("leaveProject", [])).toBe('5:::{"name":"leaveProject"}');
  });

  it("encodes the two control packets a client sends", () => {
    expect(encodeSocketIoHeartbeat()).toBe("2::");
    expect(encodeSocketIoDisconnect()).toBe("0::");
  });
});

describe("socket.io 0.9 decoding", () => {
  it("reads an acknowledgement and its arguments", () => {
    const packet = decodeSocketIoPacket('6:::1+[null,["line"],42]');
    expect(packet).toEqual({ type: "ack", acknowledgementId: 1, args: [null, ["line"], 42] });
  });

  it("reads an acknowledgement that carries no arguments", () => {
    expect(decodeSocketIoPacket("6:::7")).toEqual({ type: "ack", acknowledgementId: 7, args: [] });
  });

  it("reads a server-pushed event", () => {
    expect(decodeSocketIoPacket('5:::{"name":"otUpdateApplied","args":[{"v":3}]}')).toEqual({
      type: "event",
      name: "otUpdateApplied",
      args: [{ v: 3 }],
    });
  });

  it("names the error reason rather than leaving the caller a number", () => {
    expect(decodeSocketIoPacket("7:::2+0")).toEqual({
      type: "error",
      reason: "unauthorized",
      advice: "reconnect",
    });
  });

  it("reads the control packets", () => {
    expect(decodeSocketIoPacket("2::")).toEqual({ type: "heartbeat" });
    expect(decodeSocketIoPacket("1::")).toEqual({ type: "connect" });
    expect(decodeSocketIoPacket("0::")).toEqual({ type: "disconnect" });
    expect(decodeSocketIoPacket("8::")).toEqual({ type: "noop" });
  });

  it("returns nothing for a frame that is not a packet", () => {
    expect(decodeSocketIoPacket("")).toBeUndefined();
  });

  it("survives an event body that is not JSON", () => {
    expect(decodeSocketIoPacket("5:::not json")).toEqual({ type: "event", name: "", args: [] });
  });
});

describe("socket.io 0.9 frames carrying several packets", () => {
  it("reads every packet, not just the first", () => {
    const first = '5:::{"name":"otUpdateApplied","args":[{"v":1}]}';
    const second = '5:::{"name":"otUpdateApplied","args":[{"v":2}]}';
    const frame = `�${first.length}�${first}�${second.length}�${second}`;
    expect(decodeSocketIoFrame(frame)).toEqual([
      { type: "event", name: "otUpdateApplied", args: [{ v: 1 }] },
      { type: "event", name: "otUpdateApplied", args: [{ v: 2 }] },
    ]);
  });

  it("reads a lone packet that is not wrapped as a payload", () => {
    expect(decodeSocketIoFrame("2::")).toEqual([{ type: "heartbeat" }]);
  });

  it("stops cleanly on a truncated payload instead of looping", () => {
    expect(decodeSocketIoFrame("�12")).toEqual([]);
  });
});

describe("the handshake body", () => {
  it("reads the session id and the timeouts", () => {
    expect(parseSocketIoHandshake("s0m3s3ss10n:35:25:websocket,xhr-polling")).toEqual({
      sessionId: "s0m3s3ss10n",
      heartbeatTimeoutSeconds: 35,
      closeTimeoutSeconds: 25,
      transports: ["websocket", "xhr-polling"],
    });
  });

  it("leaves an absent heartbeat undefined rather than calling it zero", () => {
    expect(parseSocketIoHandshake("s0m3s3ss10n::60:websocket")).toMatchObject({
      heartbeatTimeoutSeconds: undefined,
      closeTimeoutSeconds: 60,
    });
  });

  it("rejects a body with no session id", () => {
    expect(parseSocketIoHandshake("")).toBeUndefined();
  });
});
