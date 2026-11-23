import { parentPort } from "node:worker_threads";

process.env.RECHECK_BACKEND = "pure";
const { check } = await import("recheck");

// Only step counts bound a check, never time, so a slow or busy machine reaches the same verdict.
// The fixed seed makes the fuzzing step repeatable.
const CHECK_PARAMETERS = { randomSeed: 0, timeout: null, incubationTimeout: null };

async function checkExpression({ index, source, flags }) {
  const result = await check(source, flags, CHECK_PARAMETERS);
  return {
    index,
    verdict: {
      status: result.status,
      complexity: result.complexity && { type: result.complexity.type, degree: result.complexity.degree },
      attack: result.attack?.pattern,
      error: result.error?.kind,
    },
  };
}

parentPort.on("message", (request) => {
  void checkExpression(request).then((reply) => parentPort.postMessage(reply));
});
