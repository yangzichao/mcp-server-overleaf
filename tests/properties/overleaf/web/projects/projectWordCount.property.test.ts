import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RequestNotSentError } from "../../../../../src/overleaf/web/overleafWebErrors.js";
import {
  fetchWordCount,
  type ProjectWordCount,
  readWordCount,
} from "../../../../../src/overleaf/web/projects/projectWordCount.js";
import { anyJsonField, awkwardText, notAnOverleafId } from "./generatedOverleafAnswers.js";
import { recordingWebClient } from "./recordingWebClient.js";

const PROJECT_ID = "64b000000000000000000002";

const COUNT_FIELDS = [
  { inTexcountAnswer: "textWords", inProjectWordCount: "textWords" },
  { inTexcountAnswer: "headWords", inProjectWordCount: "headingWords" },
  { inTexcountAnswer: "outside", inProjectWordCount: "wordsOutsideText" },
  { inTexcountAnswer: "headers", inProjectWordCount: "headingCount" },
  { inTexcountAnswer: "elements", inProjectWordCount: "floatCount" },
  { inTexcountAnswer: "mathInline", inProjectWordCount: "inlineMathCount" },
  { inTexcountAnswer: "mathDisplay", inProjectWordCount: "displayMathCount" },
  { inTexcountAnswer: "errors", inProjectWordCount: "errorCount" },
] as const;

const countValue = fc.oneof(
  { weight: 3, arbitrary: fc.nat() },
  { weight: 1, arbitrary: fc.double() },
  { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY) },
  { weight: 1, arbitrary: anyJsonField },
);

const texcount = fc.record(
  {
    ...Object.fromEntries(COUNT_FIELDS.map(({ inTexcountAnswer }) => [inTexcountAnswer, countValue])),
    messages: fc.oneof(awkwardText, anyJsonField),
  },
  { requiredKeys: [] },
);

const wordCountAnswer = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({ texcount: fc.oneof({ weight: 4, arbitrary: texcount }, anyJsonField) }),
  },
  { weight: 1, arbitrary: fc.oneof(anyJsonField, fc.constant(undefined)) },
);

function expectedWordCount(answer: unknown): ProjectWordCount {
  const inner =
    typeof answer === "object" && answer !== null ? (answer as Record<string, unknown>).texcount : {};
  const counts = typeof inner === "object" && inner !== null ? (inner as Record<string, unknown>) : {};
  const read = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const totals = Object.fromEntries(
    COUNT_FIELDS.map(({ inTexcountAnswer, inProjectWordCount }) => [
      inProjectWordCount,
      read(counts[inTexcountAnswer]),
    ]),
  );
  return {
    ...totals,
    messages: typeof counts.messages === "string" ? counts.messages.trim() : "",
  } as unknown as ProjectWordCount;
}

const filePath = fc
  .array(
    fc.constantFrom("./", "/", "sections", "a b.tex", "&", "=", "#", "?", "+", "%20", "é", "𝔸", ".tex"),
    {
      maxLength: 5,
    },
  )
  .map((pieces) => pieces.join(""));

function overleafFilePath(path: string): string {
  if (path.startsWith("./")) return path.slice("./".length);
  if (path.startsWith("/")) return path.slice("/".length);
  return path;
}

describe("projectWordCount properties", () => {
  it("reads each count as the finite number Overleaf sent, or zero, and never throws", () => {
    fc.assert(
      fc.property(wordCountAnswer, (answer) => {
        expect(readWordCount(answer)).toEqual(expectedWordCount(answer));
      }),
    );
  });

  it("asks for the file and compile server given, which Overleaf reads back as given", async () => {
    const options = fc.record(
      { filePath, clsiServerId: fc.constantFrom("", "clsi-fake-1", "a&b=c", "x y", "é") },
      { requiredKeys: [] },
    );
    await fc.assert(
      fc.asyncProperty(options, async (chosen) => {
        const { client, sent } = recordingWebClient(() => ({ texcount: {} }));
        await fetchWordCount(client, PROJECT_ID, chosen);
        expect(sent).toHaveLength(1);
        const [request] = sent;
        const asked = new URL(request?.path ?? "", "https://overleaf.invalid");
        expect(asked.pathname).toBe(`/project/${PROJECT_ID}/wordcount`);
        const expectedFile = chosen.filePath ? overleafFilePath(chosen.filePath) : null;
        expect(asked.searchParams.get("file")).toBe(expectedFile);
        expect(asked.searchParams.get("clsiserverid")).toBe(chosen.clsiServerId || null);
        expect(asked.hash).toBe("");
        expect(request?.timeoutMs).toBe(120_000);
      }),
    );
  });

  it("refuses a project id that is not an Overleaf id without sending anything", async () => {
    await fc.assert(
      fc.asyncProperty(notAnOverleafId, async (projectId) => {
        const { client, sent } = recordingWebClient(() => ({ texcount: {} }));
        await expect(fetchWordCount(client, projectId)).rejects.toBeInstanceOf(RequestNotSentError);
        expect(sent).toEqual([]);
      }),
    );
  });
});
