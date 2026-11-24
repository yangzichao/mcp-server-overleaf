import { parentPort } from "node:worker_threads";

process.env.RECHECK_BACKEND = "pure";
const { check } = await import("recheck");

const PARAMETERS_FOR_THE_SAME_VERDICT_ON_EVERY_MACHINE = {
  randomSeed: 0,
  timeout: null,
  incubationTimeout: null,
};

async function checkExpression({ index, source, flags }) {
  const result = await check(source, flags, PARAMETERS_FOR_THE_SAME_VERDICT_ON_EVERY_MACHINE);
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
