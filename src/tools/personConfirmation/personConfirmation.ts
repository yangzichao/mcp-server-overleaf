import {
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
  type InputRequiredResult,
  inputRequired,
  inputResponse,
  type McpServer,
  type ServerContext,
} from "@modelcontextprotocol/server";

import { type ToolTextResult, textResult } from "../toolContext.js";

export interface ConfirmationQuestion {
  readonly key: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly withoutConfirmation: string;
  readonly whenNotConfirmed: string;
}

const CONFIRM_FIELD = "confirm";

/** The SDK's reading: a bare `elicitation: {}` is form support, as it was before modes existed. */
function supportsFormElicitation(capabilities: ClientCapabilities): boolean {
  const elicitation = capabilities.elicitation;
  if (elicitation === undefined) return false;
  return elicitation.form !== undefined || elicitation.url === undefined;
}

/**
 * Over HTTP on a 2025 protocol revision the SDK answers each request with a new server, which
 * never saw `initialize` and cannot send the client a request.
 */
function whyNobodyCanBeAsked(capabilities: ClientCapabilities | undefined): string | undefined {
  if (capabilities === undefined)
    return "This connection gives no way to ask the person using the MCP client to confirm";
  if (!supportsFormElicitation(capabilities))
    return "This MCP client does not support elicitation, so the person using it cannot be asked to confirm";
  return undefined;
}

export class PersonConfirmation {
  constructor(
    private readonly clientCapabilities: ClientCapabilities | undefined,
    private readonly inputResponses: Record<string, unknown> | undefined,
  ) {}

  /**
   * A 2026-07-28 request carries the client's capabilities itself. On a 2025 connection they
   * come from `initialize`, and the SDK answers this call's elicitation and calls the tool again.
   */
  static forRequest(server: McpServer, requestContext: ServerContext): PersonConfirmation {
    const envelope: Record<string, unknown> | undefined = requestContext.mcpReq.envelope;
    const declared = envelope?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined;
    return new PersonConfirmation(
      declared ?? server.server.getClientCapabilities(),
      requestContext.mcpReq.inputResponses,
    );
  }

  replyUntilConfirmed(question: ConfirmationQuestion): ToolTextResult | InputRequiredResult | undefined {
    const answer = inputResponse(this.inputResponses, question.key);
    if (answer.kind === "elicit") {
      const confirmed = answer.action === "accept" && answer.content?.[CONFIRM_FIELD] === true;
      return confirmed ? undefined : textResult(question.whenNotConfirmed);
    }
    const reasonNobodyCanBeAsked = whyNobodyCanBeAsked(this.clientCapabilities);
    if (reasonNobodyCanBeAsked !== undefined)
      throw new Error(`${reasonNobodyCanBeAsked}, and ${question.withoutConfirmation}`);
    return inputRequired({
      inputRequests: {
        [question.key]: inputRequired.elicit({
          message: question.message,
          requestedSchema: {
            type: "object",
            properties: { [CONFIRM_FIELD]: { type: "boolean", title: question.confirmLabel } },
            required: [CONFIRM_FIELD],
          },
        }),
      },
    });
  }
}
