import { afterEach, describe, expect, it } from "vitest";

import { FAKE_PENDING_INVITES } from "../fakeWebRoutes/fakeProjectMembers.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";
import { McpHttpClient } from "../support/mcpHttpClient.js";
import { responseText } from "../support/mcpProtocol.js";

const INVITATION = { action: "invite", email: "new.coauthor@example.com", accessLevel: "view" };
const CAN_ASK_IN_A_FORM = { elicitation: { form: {} } };

/** The SDK refuses a 2026-07-28 POST whose headers do not repeat the revision, method and tool name. */
const MODERN_TOOL_CALL_HEADERS = {
  "mcp-protocol-version": "2026-07-28",
  "mcp-method": "tools/call",
  "mcp-name": "manage_project",
};

function modernToolCall(
  clientCapabilities: Record<string, unknown>,
  inputResponses?: Record<string, unknown>,
) {
  return {
    name: "manage_project",
    arguments: INVITATION,
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": clientCapabilities,
      "io.modelcontextprotocol/clientInfo": { name: "http-integration-test", version: "1" },
    },
    ...(inputResponses ? { inputResponses } : {}),
  };
}

describe("confirming an invitation over the HTTP transport", () => {
  const harness = useEditorTestHarness();
  let client: McpHttpClient | undefined;

  afterEach(async () => {
    await client?.stop();
    client = undefined;
  });

  async function connect(capabilities: Record<string, unknown> = {}): Promise<McpHttpClient> {
    client = await McpHttpClient.start(harness.reviewEnvironment(), { capabilities });
    return client;
  }

  it("refuses on a 2025 revision, where each request reaches a new server, even for a client that declared elicitation", async () => {
    const reply = await (await connect(CAN_ASK_IN_A_FORM)).callRaw("manage_project", INVITATION);
    expect(reply.result?.isError).toBe(true);
    expect(responseText(reply)).toBe(
      'This connection gives no way to ask the person using the MCP client to confirm, and manage_project sends an invitation only after they confirm it. Nothing was sent; invite new.coauthor@example.com from the Share menu of "Fake paper" in Overleaf instead.',
    );
    expect(harness.editor.sharing.invites).toEqual(FAKE_PENDING_INVITES);
  });

  it("asks on the 2026-07-28 revision, and invites once the call comes back with the yes", async () => {
    const http = await connect();
    const asked = await http.request(
      "tools/call",
      modernToolCall(CAN_ASK_IN_A_FORM),
      MODERN_TOOL_CALL_HEADERS,
    );
    expect(asked.result?.resultType).toBe("input_required");
    const questions = Object.entries(asked.result?.inputRequests ?? {});
    expect(questions).toHaveLength(1);
    const [questionKey, question] = questions[0] ?? [];
    expect(question).toEqual({
      method: "elicitation/create",
      params: expect.objectContaining({
        mode: "form",
        message: expect.stringContaining(
          'Send an Overleaf invitation for "Fake paper" to new.coauthor@example.com?',
        ),
      }),
    });
    expect(harness.editor.sharing.invites).toEqual(FAKE_PENDING_INVITES);

    const confirmed = await http.request(
      "tools/call",
      modernToolCall(CAN_ASK_IN_A_FORM, {
        [String(questionKey)]: { action: "accept", content: { confirm: true } },
      }),
      MODERN_TOOL_CALL_HEADERS,
    );
    expect(confirmed.result?.isError).toBeUndefined();
    expect(responseText(confirmed)).toContain(
      'Invited new.coauthor@example.com to "Fake paper" with access "can view".',
    );
    expect(harness.editor.sharing.invites).toEqual([
      ...FAKE_PENDING_INVITES,
      expect.objectContaining({ email: "new.coauthor@example.com", privileges: "readOnly" }),
    ]);
  });

  it("refuses on the 2026-07-28 revision when the request declares no elicitation", async () => {
    const http = await connect();
    const reply = await http.request("tools/call", modernToolCall({}), MODERN_TOOL_CALL_HEADERS);
    expect(reply.result?.isError).toBe(true);
    expect(responseText(reply)).toBe(
      'This MCP client does not support elicitation, so the person using it cannot be asked to confirm, and manage_project sends an invitation only after they confirm it. Nothing was sent; invite new.coauthor@example.com from the Share menu of "Fake paper" in Overleaf instead.',
    );
    expect(harness.editor.sharing.invites).toEqual(FAKE_PENDING_INVITES);
  });
});
