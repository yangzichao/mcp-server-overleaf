import { Worker } from "node:worker_threads";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const PAYLOAD_DELIMITER = "�";
const DECODE_DEADLINE_MS = 1_000;

/**
 * A frame that makes the decoder loop forever would also block this thread, so each frame is
 * decoded in a worker that can be abandoned. The worker imports the compiled module, which the
 * global setup builds, because Node 22.14 cannot strip the types of the source without a flag.
 */
const PROTOCOL_MODULE_URL = new URL(
  "../../../../dist/overleaf/realtime/socketIoZeroNineProtocol.js",
  import.meta.url,
);
const DECODER_SOURCE = `
import { parentPort, workerData } from "node:worker_threads";
const { decodeSocketIoFrame } = await import(${JSON.stringify(PROTOCOL_MODULE_URL.href)});
parentPort.postMessage(decodeSocketIoFrame(workerData));
`;
const DECODER_URL = new URL(`data:text/javascript,${encodeURIComponent(DECODER_SOURCE)}`);

async function decodeWithinDeadline(
  frame: string,
): Promise<{ finished: true; packets: unknown[] } | { finished: false }> {
  const worker = new Worker(DECODER_URL, { workerData: frame });
  try {
    return await new Promise((resolveDecode, rejectDecode) => {
      const deadline = setTimeout(() => resolveDecode({ finished: false }), DECODE_DEADLINE_MS);
      worker.once("message", (packets: unknown[]) => {
        clearTimeout(deadline);
        resolveDecode({ finished: true, packets });
      });
      worker.once("error", (error) => {
        clearTimeout(deadline);
        rejectDecode(error);
      });
    });
  } finally {
    await worker.terminate();
  }
}

const lengthField = fc.oneof(
  fc.nat({ max: 40 }).map(String),
  fc.integer({ min: -40, max: -1 }).map(String),
  fc.constantFrom("", " ", "abc", "1e400", "0x10", "0.5"),
);
const payloadShapedFrame = fc
  .array(fc.tuple(lengthField, fc.constantFrom("3:::", "2::", '5:::{"name":"x"}', "")), {
    minLength: 1,
    maxLength: 4,
  })
  .map((segments) =>
    segments.map(([length, packet]) => `${PAYLOAD_DELIMITER}${length}${PAYLOAD_DELIMITER}${packet}`).join(""),
  );

describe("decodeSocketIoFrame termination", () => {
  it("decodes a well-formed payload in the worker, so the harness itself works", async () => {
    const decoded = await decodeWithinDeadline(`${PAYLOAD_DELIMITER}3${PAYLOAD_DELIMITER}2::`);
    expect(decoded).toEqual({ finished: true, packets: [{ type: "heartbeat" }] });
  });

  it("finishes on any payload-shaped frame, whatever its length fields say", async () => {
    await fc.assert(
      fc.asyncProperty(payloadShapedFrame, async (frame) => {
        expect(await decodeWithinDeadline(frame)).toMatchObject({ finished: true });
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});
