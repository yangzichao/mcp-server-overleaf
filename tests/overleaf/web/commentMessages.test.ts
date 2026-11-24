import { beforeEach, describe, expect, it } from "vitest";

import { deleteCommentMessage, editCommentMessage } from "../../../src/overleaf/web/commentMessages.js";
import { RequestNotSentError } from "../../../src/overleaf/web/overleafWebErrors.js";
import { failureOf, statusOf } from "./support/failureOf.js";
import { useFakeOverleafConnection } from "./support/fakeOverleafConnection.js";

const THREAD_ID = "6600000000000000000000a1";
/** The fake numbers messages in the order they were seeded. */
const ADAS_MESSAGE = "message-1";
const OWN_MESSAGE = "message-2";

describe("editing and deleting one comment message", () => {
  const connection = useFakeOverleafConnection();
  const projectId = (): string => connection.overleaf.projectId;
  const messagesLeft = (): string[] =>
    (connection.overleaf.web.threads.get(THREAD_ID)?.messages ?? []).map((message) => message.content);

  beforeEach(() => {
    connection.overleaf.web.addThread(THREAD_ID, [
      { author: "Ada", content: "Is this bound tight?" },
      { author: "You", content: "Yes, see Lemma 2." },
    ]);
  });

  it("edits the account's own message", async () => {
    await editCommentMessage(connection.client(), projectId(), THREAD_ID, OWN_MESSAGE, "Yes, see Lemma 3.");
    expect(messagesLeft()).toEqual(["Is this bound tight?", "Yes, see Lemma 3."]);
  });

  it("passes on a refusal to edit someone else's message, and refuses an empty one", async () => {
    const refused = await failureOf(
      editCommentMessage(connection.client(), projectId(), THREAD_ID, ADAS_MESSAGE, "Changed"),
    );
    expect(statusOf(refused)).toBe(403);
    const empty = await failureOf(
      editCommentMessage(connection.client(), projectId(), THREAD_ID, OWN_MESSAGE, " "),
    );
    expect(empty).toBeInstanceOf(RequestNotSentError);
  });

  it("lets the owner delete anyone's message", async () => {
    await deleteCommentMessage(connection.client(), projectId(), THREAD_ID, ADAS_MESSAGE, "owner");
    expect(messagesLeft()).toEqual(["Yes, see Lemma 2."]);
    expect(connection.changesSentTo(/messages/)).toEqual([
      `DELETE /project/${projectId()}/thread/${THREAD_ID}/messages/${ADAS_MESSAGE}`,
    ]);
  });

  it("sends a reviewer through the route for their own messages, which refuses anyone else's", async () => {
    connection.overleaf.permissionsLevel = "review";
    await deleteCommentMessage(connection.client(), projectId(), THREAD_ID, OWN_MESSAGE, "review");
    const refused = await failureOf(
      deleteCommentMessage(connection.client(), projectId(), THREAD_ID, ADAS_MESSAGE, "review"),
    );
    expect(statusOf(refused)).toBe(403);
    expect(messagesLeft()).toEqual(["Is this bound tight?"]);
    expect(connection.changesSentTo(/messages/)).toEqual([
      `DELETE /project/${projectId()}/thread/${THREAD_ID}/own-messages/${OWN_MESSAGE}`,
      `DELETE /project/${projectId()}/thread/${THREAD_ID}/own-messages/${ADAS_MESSAGE}`,
    ]);
  });

  it("refuses read-only access and an id that would change the path, without sending anything", async () => {
    const client = connection.client();
    const readOnly = await failureOf(
      deleteCommentMessage(client, projectId(), THREAD_ID, ADAS_MESSAGE, "readOnly"),
    );
    expect(readOnly).toBeInstanceOf(RequestNotSentError);
    const traversal = await failureOf(
      deleteCommentMessage(client, projectId(), THREAD_ID, "../../settings", "owner"),
    );
    expect(traversal).toBeInstanceOf(RequestNotSentError);
    expect(connection.changesSentTo(/thread/)).toEqual([]);
  });
});
