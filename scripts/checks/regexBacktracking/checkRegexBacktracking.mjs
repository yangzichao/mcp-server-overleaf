import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { findRegularExpressions, listTypeScriptFiles } from "./findRegularExpressions.mjs";

// Every regular expression in src runs on text the server does not control: a co-author's
// LaTeX, a bibliography, an answer from arXiv or Crossref. One that backtracks
// super-linearly lets a crafted file stall a tool, as the four CodeQL found in 0.5.0 did.
// recheck decides it from the pattern alone, and its pure JavaScript backend needs no native
// binary or Java.

const checkDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(checkDirectory, "../../..");
const reviewedPath = join(checkDirectory, "reviewedRegularExpressions.json");

function expressionKey(expression) {
  return `${expression.file}\n/${expression.source}/${expression.flags}`;
}

/** Patterns reviewed and kept on purpose, each with the reason its input cannot grow large. */
function readReviewedExpressions() {
  const reviewed = JSON.parse(readFileSync(reviewedPath, "utf8"));
  return new Map(reviewed.map((entry) => [expressionKey(entry), entry.reason]));
}

/** Checks the expressions on a pool of workers, handing each idle worker the next one, in input order. */
function checkOnWorkers(expressions) {
  if (expressions.length === 0) return Promise.resolve([]);
  const verdicts = new Array(expressions.length);
  let nextIndex = 0;
  let finishedCount = 0;
  return new Promise((resolveVerdicts, reject) => {
    const workerCount = Math.min(availableParallelism(), expressions.length);
    for (let workerNumber = 0; workerNumber < workerCount; workerNumber += 1) {
      const worker = new Worker(new URL("./recheckWorker.mjs", import.meta.url));
      const sendNextExpression = () => {
        if (nextIndex >= expressions.length) {
          worker.unref();
          return;
        }
        const { source, flags } = expressions[nextIndex];
        worker.postMessage({ index: nextIndex, source, flags });
        nextIndex += 1;
      };
      worker.on("message", ({ index, verdict }) => {
        verdicts[index] = verdict;
        finishedCount += 1;
        if (finishedCount === expressions.length) resolveVerdicts(verdicts);
        sendNextExpression();
      });
      worker.on("error", reject);
      sendNextExpression();
    }
  });
}

function describeVerdict(verdict) {
  if (verdict.status === "unknown") return `not decided: ${verdict.error ?? "unknown"}`;
  const { type, degree } = verdict.complexity;
  return `${type === "polynomial" ? `O(n^${degree})` : type} on ${verdict.attack}`;
}

const reviewed = readReviewedExpressions();
const expressions = listTypeScriptFiles(root, "src").flatMap((file) => findRegularExpressions(root, file));
const verdicts = await checkOnWorkers(expressions);
const failures = [];
const usedReviews = new Set();
for (const [index, expression] of expressions.entries()) {
  const verdict = verdicts[index];
  if (verdict.status === "safe") continue;
  const key = expressionKey(expression);
  if (reviewed.has(key)) {
    usedReviews.add(key);
    continue;
  }
  const builtNote = expression.builtAtRunTime ? " (built at run time)" : "";
  failures.push(
    `${expression.file}:${expression.line}  /${expression.source}/${expression.flags}${builtNote}\n    ${describeVerdict(verdict)}`,
  );
}
for (const stale of [...reviewed.keys()].filter((key) => !usedReviews.has(key))) {
  failures.push(
    `${stale.replaceAll("\n", "  ")}\n    reviewed in ${reviewedPath} but no longer found or no longer slow`,
  );
}

if (failures.length > 0) {
  console.error(
    `${failures.length} regular expression(s) backtrack super-linearly or could not be decided:\n`,
  );
  for (const failure of failures) console.error(`${failure}\n`);
  process.exit(1);
}
console.error(`Checked ${expressions.length} regular expressions in src: none backtracks super-linearly.`);
