import type { ClientCapabilities } from "@modelcontextprotocol/server";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type ConfirmationQuestion,
  PersonConfirmation,
} from "../../../../src/tools/personConfirmation/personConfirmation.js";

const QUESTION_KEY = "set_access 64a9e007bbd07f6ed38ca5f1 6500000000000000000000aa readAndWrite";
const QUESTION: ConfirmationQuestion = {
  key: QUESTION_KEY,
  message: "Change the access?",
  confirmLabel: "Change the access",
  withoutConfirmation: "nothing changes without a yes",
  whenNotConfirmed: "not confirmed",
};

const capabilities: fc.Arbitrary<ClientCapabilities | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom<ClientCapabilities>(
    {},
    { sampling: {} },
    { elicitation: {} },
    { elicitation: { form: {} } },
    { elicitation: { url: {} } },
    { elicitation: { form: {}, url: {} } },
  ),
);

const elicitationLikeAnswer = fc.record(
  {
    action: fc.oneof(fc.constantFrom("accept", "decline", "cancel", "ACCEPT", "yes", ""), fc.jsonValue()),
    content: fc.oneof(
      fc.record({ confirm: fc.oneof(fc.constant(true), fc.constant(false), fc.jsonValue()) }),
      fc.dictionary(fc.string(), fc.jsonValue()),
      fc.jsonValue(),
    ),
  },
  { requiredKeys: [] },
);

const answer = fc.oneof(elicitationLikeAnswer, fc.jsonValue());

const inputResponses: fc.Arbitrary<Record<string, unknown> | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.dictionary(fc.oneof(fc.constant(QUESTION_KEY), fc.constant(`${QUESTION_KEY} `), fc.string()), answer),
);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The answer to this question, read the way the MCP specification defines an elicitation result. */
function expectedAnswer(
  responses: Record<string, unknown> | undefined,
): "confirmed" | "not confirmed" | "none" {
  const entry = responses && Object.hasOwn(responses, QUESTION_KEY) ? responses[QUESTION_KEY] : undefined;
  if (!isObjectRecord(entry) || !["accept", "decline", "cancel"].includes(entry.action as string))
    return "none";
  const ticked = isObjectRecord(entry.content) && entry.content.confirm === true;
  return entry.action === "accept" && ticked ? "confirmed" : "not confirmed";
}

function canAskInAForm(declared: ClientCapabilities | undefined): boolean {
  const elicitation = declared?.elicitation;
  return elicitation !== undefined && (elicitation.form !== undefined || elicitation.url === undefined);
}

function expectedRefusal(declared: ClientCapabilities | undefined): string {
  const reason =
    declared === undefined
      ? "This connection gives no way to ask the person using the MCP client to confirm"
      : "This MCP client does not support elicitation, so the person using it cannot be asked to confirm";
  return `${reason}, and nothing changes without a yes`;
}

describe("confirming a change through elicitation", () => {
  it("goes ahead only on an accepted answer to this very question with confirm exactly true", () => {
    fc.assert(
      fc.property(capabilities, inputResponses, (declared, responses) => {
        const confirmation = new PersonConfirmation(declared, responses);
        const expected = expectedAnswer(responses);
        if (expected === "confirmed") {
          expect(confirmation.replyUntilConfirmed(QUESTION)).toBeUndefined();
        } else if (expected === "not confirmed") {
          expect(confirmation.replyUntilConfirmed(QUESTION)).toEqual({
            content: [{ type: "text", text: "not confirmed" }],
          });
        } else if (canAskInAForm(declared)) {
          expect(confirmation.replyUntilConfirmed(QUESTION)).toEqual(
            expect.objectContaining({
              resultType: "input_required",
              inputRequests: { [QUESTION_KEY]: expect.anything() },
            }),
          );
        } else {
          expect(() => confirmation.replyUntilConfirmed(QUESTION)).toThrow(
            new Error(expectedRefusal(declared)),
          );
        }
      }),
    );
  });
});
