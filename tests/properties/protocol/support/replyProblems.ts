import type { JsonRpcResponse, McpContentBlock } from "../../../integration/support/mcpProtocol.js";

/** JSON-RPC's code for arguments a method refuses, the one error a schema-valid call may still get. */
const INVALID_PARAMS = -32602;

/**
 * Text that only reaches a reply when code failed rather than refused: a JavaScript error's
 * name or stock message, a stack frame, Node's own file system error, or a value interpolated
 * without being checked. The seeded project and the generated arguments contain none of these.
 */
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

/** Why a reply to a call made with schema-valid arguments is not a proper answer, if it is not. */
export function replyProblems(response: JsonRpcResponse): string[] {
  if (response.error) {
    return response.error.code === INVALID_PARAMS
      ? []
      : [`JSON-RPC error ${response.error.code}: ${response.error.message}`];
  }
  const content = response.result?.content ?? [];
  return content.length === 0 ? ["The reply has no content."] : content.flatMap(blockProblems);
}

/** The argument a refusal names as not applying, or as missing, so the next try can fix it. */
export function argumentToRepair(
  replyText: string,
): { kind: "drop"; name: string } | { kind: "add"; name: string } | undefined {
  const notApplying = /\b(\w+) does not apply to \w+/.exec(replyText);
  if (notApplying?.[1]) return { kind: "drop", name: notApplying[1] };
  const missing = /\b\w+ needs (\w+)\./.exec(replyText);
  if (missing?.[1]) return { kind: "add", name: missing[1] };
  return undefined;
}
