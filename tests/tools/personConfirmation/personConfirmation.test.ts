import type { ClientCapabilities } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";

import {
  type ConfirmationQuestion,
  PersonConfirmation,
} from "../../../src/tools/personConfirmation/personConfirmation.js";

const QUESTION: ConfirmationQuestion = {
  key: "invite 64a9e007bbd07f6ed38ca5f1 ada@example.com readOnly",
  message: 'Send an Overleaf invitation for "Paper" to ada@example.com?',
  confirmLabel: "Send the invitation",
  withoutConfirmation: "manage_project sends an invitation only after they confirm it. Nothing was sent.",
  whenNotConfirmed: "The invitation to ada@example.com was not confirmed, so nothing was sent.",
};

const FORM_REQUEST = {
  resultType: "input_required",
  inputRequests: {
    [QUESTION.key]: {
      method: "elicitation/create",
      params: {
        mode: "form",
        message: QUESTION.message,
        requestedSchema: {
          type: "object",
          properties: { confirm: { type: "boolean", title: "Send the invitation" } },
          required: ["confirm"],
        },
      },
    },
  },
};

const ASKS_IN_A_FORM: ClientCapabilities = { elicitation: {} };

function replyTo(
  capabilities: ClientCapabilities | undefined,
  inputResponses: Record<string, unknown> | undefined,
) {
  return new PersonConfirmation(capabilities, inputResponses).replyUntilConfirmed(QUESTION);
}

function refusalOn(capabilities: ClientCapabilities | undefined): string {
  try {
    replyTo(capabilities, undefined);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("The question was put to a client that cannot ask it");
}

describe("asking the person using the MCP client to confirm a change", () => {
  it.each<[string, ClientCapabilities]>([
    ["a bare elicitation capability", { elicitation: {} }],
    ["form elicitation", { elicitation: { form: {} } }],
    ["form and URL elicitation", { elicitation: { form: {}, url: {} } }],
  ])("asks through a form on a client that declares %s", (_name, capabilities) => {
    expect(replyTo(capabilities, undefined)).toEqual(FORM_REQUEST);
  });

  it("fails without asking when the connection knows nothing of the client, as HTTP on a 2025 revision does", () => {
    expect(refusalOn(undefined)).toBe(
      "This connection gives no way to ask the person using the MCP client to confirm, and manage_project sends an invitation only after they confirm it. Nothing was sent.",
    );
  });

  it.each<[string, ClientCapabilities]>([
    ["no elicitation", { sampling: {} }],
    ["URL elicitation only", { elicitation: { url: {} } }],
  ])("fails without asking on a client with %s", (_name, capabilities) => {
    expect(refusalOn(capabilities)).toBe(
      "This MCP client does not support elicitation, so the person using it cannot be asked to confirm, and manage_project sends an invitation only after they confirm it. Nothing was sent.",
    );
  });

  it("lets the change go ahead on an accepted form with the box ticked, whatever the client declares", () => {
    const confirmed = { [QUESTION.key]: { action: "accept", content: { confirm: true } } };
    expect(replyTo(ASKS_IN_A_FORM, confirmed)).toBeUndefined();
    expect(replyTo(undefined, confirmed)).toBeUndefined();
  });

  it.each<[string, Record<string, unknown>]>([
    ["declined", { action: "decline" }],
    ["dismissed", { action: "cancel" }],
    ["accepted with the box unticked", { action: "accept", content: { confirm: false } }],
    ["accepted with the word true", { action: "accept", content: { confirm: "true" } }],
    ["accepted with nothing filled in", { action: "accept" }],
  ])("answers without an error, and so without the change, when %s", (_name, answer) => {
    expect(replyTo(ASKS_IN_A_FORM, { [QUESTION.key]: answer })).toEqual({
      content: [{ type: "text", text: QUESTION.whenNotConfirmed }],
    });
  });

  it("asks again when the only answer is to another question", () => {
    const answerToAnotherInvitation = {
      "invite 64a9e007bbd07f6ed38ca5f1 bea@example.com readOnly": {
        action: "accept",
        content: { confirm: true },
      },
    };
    expect(replyTo(ASKS_IN_A_FORM, answerToAnotherInvitation)).toEqual(FORM_REQUEST);
  });
});
