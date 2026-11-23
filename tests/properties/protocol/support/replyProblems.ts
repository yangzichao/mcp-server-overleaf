import type { JsonRpcResponse, McpContentBlock } from "../../../integration/support/mcpProtocol.js";

const INVALID_PARAMS = -32602;

const SIGNS_OF_A_CRASH: readonly RegExp[] = [
  /\b(?:TypeError|ReferenceError|RangeError|EvalError|URIError|AggregateError)\b/,
  /\bE(?:NOENT|ISDIR|NOTDIR|ACCES|PERM|EXIST|NOTEMPTY|BUSY|MFILE|NAMETOOLONG|LOOP):/,
  /Cannot (?:read|set) propert/,
  /\bis not (?:a function|iterable|a constructor)\b/,
  /Maximum call stack/,
  /\n\s+at (?:async )?\S+ \(?(?:file:\/\/|node:|\/)/,
  /\[object \w+\]/,
  /\bNaN\b/,
  /\bInfinity\b/,
  /[/(:="'`[{]\s?undefined\b/,
  /\bundefined(?=[/.:)\]}"'`])/,
];

export function showsASignOfACrash(text: string): boolean {
  return SIGNS_OF_A_CRASH.some((sign) => sign.test(text));
}

function blockProblems(block: McpContentBlock): string[] {
  if (block.type === "image") {
    return block.data && block.mimeType?.startsWith("image/") ? [] : ["An image block has no data."];
  }
  const text = block.text ?? "";
  const problems = text.trim() === "" ? ["A text block is empty."] : [];
  for (const sign of SIGNS_OF_A_CRASH) {
    const match = sign.exec(text);
    if (match) {
      const around = text.slice(Math.max(0, match.index - 80), match.index + 120);
      problems.push(`The reply shows ${sign}: …${around}…`);
    }
  }
  return problems;
}

export function replyProblems(response: JsonRpcResponse): string[] {
  if (response.error) {
    return response.error.code === INVALID_PARAMS
      ? []
      : [`JSON-RPC error ${response.error.code}: ${response.error.message}`];
  }
  const content = response.result?.content ?? [];
  return content.length === 0 ? ["The reply has no content."] : content.flatMap(blockProblems);
}

export function argumentToRepair(
  replyText: string,
): { kind: "drop"; name: string } | { kind: "add"; name: string } | undefined {
  const notApplying = /\b(\w+) does not apply to \w+/.exec(replyText);
  if (notApplying?.[1]) return { kind: "drop", name: notApplying[1] };
  const missing = /\b\w+ needs (\w+)\./.exec(replyText);
  if (missing?.[1]) return { kind: "add", name: missing[1] };
  return undefined;
}
