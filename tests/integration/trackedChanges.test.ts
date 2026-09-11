import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findDocument } from "../../src/overleaf/realtime/overleafProjectDocuments.js";
import {
  generateTrackedChangeIdSeed,
  OverleafRealtimeSession,
} from "../../src/overleaf/realtime/overleafRealtimeSession.js";
import { FakeOverleafRealtime } from "./fakeOverleafRealtime.js";

const PAPER = "\\documentclass{article}\n\\begin{document}\nHello world.\n\\end{document}";

describe("a real-time session against Overleaf", () => {
  let remote: FakeOverleafRealtime;
  let mainDocumentId: string;
  let session: OverleafRealtimeSession | undefined;

  beforeEach(async () => {
    remote = await FakeOverleafRealtime.start();
    mainDocumentId = remote.addDocument("main.tex", PAPER);
    remote.addDocument("sections/introduction.tex", "The introduction.");
  });

  afterEach(async () => {
    session?.close();
    session = undefined;
    await remote.stop();
  });

  async function openSession(): Promise<OverleafRealtimeSession> {
    session = await OverleafRealtimeSession.open({
      baseUrl: remote.baseUrl,
      cookieHeader: remote.cookieHeader,
      overleafProjectId: remote.projectId,
      connectTimeoutMs: 5_000,
      callTimeoutMs: 5_000,
    });
    return session;
  }

  it("connects with a session cookie and learns the project's documents", async () => {
    const opened = await openSession();
    expect(opened.project.name).toBe("Fake paper");
    expect(opened.permissionsLevel).toBe("owner");
    expect(opened.project.documents.map((document) => document.path)).toEqual([
      "main.tex",
      "sections/introduction.tex",
    ]);
  });

  it("refuses a connection with no session cookie, naming the cookie as the cause", async () => {
    await expect(
      OverleafRealtimeSession.open({
        baseUrl: remote.baseUrl,
        cookieHeader: "",
        overleafProjectId: remote.projectId,
        connectTimeoutMs: 5_000,
      }),
    ).rejects.toThrow(/did not accept the session cookie/i);
  });

  it("reports the project rather than the transport when the project is not this account's", async () => {
    await expect(
      OverleafRealtimeSession.open({
        baseUrl: remote.baseUrl,
        cookieHeader: remote.cookieHeader,
        overleafProjectId: "64ffffffffffffffffffffff",
        connectTimeoutMs: 5_000,
      }),
    ).rejects.toThrow(/not authorized to open this project/i);
  });

  it("reads a document and its version", async () => {
    const opened = await openSession();
    const document = await opened.joinDocument(mainDocumentId);
    expect(document.lines).toEqual(PAPER.split("\n"));
    expect(document.version).toBe(0);
    expect(document.ranges.changes).toEqual([]);
  });

  it("restores non-Latin text, which the real service escapes on the way out", async () => {
    const chinese = "第一节：方法\n我们提出一个新方法。";
    const documentId = remote.addDocument("chinese.tex", chinese);
    const opened = await openSession();
    const document = await opened.joinDocument(documentId);
    expect(document.lines.join("\n")).toBe(chinese);
  });
});

describe("edits that land as suggestions", () => {
  let remote: FakeOverleafRealtime;
  let mainDocumentId: string;
  let session: OverleafRealtimeSession | undefined;

  beforeEach(async () => {
    remote = await FakeOverleafRealtime.start();
    mainDocumentId = remote.addDocument("main.tex", PAPER);
  });

  afterEach(async () => {
    session?.close();
    session = undefined;
    await remote.stop();
  });

  async function openSession(): Promise<OverleafRealtimeSession> {
    session = await OverleafRealtimeSession.open({
      baseUrl: remote.baseUrl,
      cookieHeader: remote.cookieHeader,
      overleafProjectId: remote.projectId,
      connectTimeoutMs: 5_000,
      callTimeoutMs: 5_000,
    });
    return session;
  }

  it("records an insertion as a tracked change when an id seed is sent", async () => {
    const opened = await openSession();
    const document = await opened.joinDocument(mainDocumentId);
    const seed = generateTrackedChangeIdSeed();
    await opened.applyOperations(mainDocumentId, document.version, [{ p: 47, i: "brave new " }], seed);

    const changes = remote.trackedChanges(mainDocumentId);
    expect(changes).toHaveLength(1);
    const [inserted] = changes;
    expect(inserted!.op.i).toBe("brave new ");
    expect(inserted!.id).toMatch(/^[0-9a-f]{24}$/);
    expect(inserted!.id.startsWith(seed)).toBe(true);
  });

  it("writes plain text, leaving no suggestion, when no id seed is sent", async () => {
    const opened = await openSession();
    const document = await opened.joinDocument(mainDocumentId);
    await opened.applyOperations(mainDocumentId, document.version, [{ p: 47, i: "brave new " }]);

    expect(remote.trackedChanges(mainDocumentId)).toHaveLength(0);
    expect(remote.documentText(mainDocumentId)).toContain("brave new world");
  });

  it("records what a tracked deletion removed, so rejecting it can put the text back", async () => {
    const opened = await openSession();
    const document = await opened.joinDocument(mainDocumentId);
    await opened.applyOperations(
      mainDocumentId,
      document.version,
      [{ p: 41, d: "Hello" }],
      generateTrackedChangeIdSeed(),
    );

    expect(remote.documentText(mainDocumentId)).not.toContain("Hello");
    const [change] = remote.trackedChanges(mainDocumentId);
    expect(change!.op.d).toBe("Hello");
    expect(change!.op.p).toBe(41);
  });

  it("reads back its own suggestions with author and position", async () => {
    const opened = await openSession();
    const document = await opened.joinDocument(mainDocumentId);
    await opened.applyOperations(
      mainDocumentId,
      document.version,
      [{ p: 47, i: "brave new " }],
      generateTrackedChangeIdSeed(),
    );

    const reread = await opened.joinDocument(mainDocumentId);
    expect(reread.ranges.changes).toHaveLength(1);
    const [suggestion] = reread.ranges.changes;
    expect(suggestion).toMatchObject({
      kind: "insertion",
      text: "brave new ",
      position: 47,
      authorId: remote.userId,
    });
    expect(suggestion!.madeAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("refuses a suggestion on a read-only project instead of silently doing nothing", async () => {
    remote.permissionsLevel = "readOnly";
    const opened = await openSession();
    const document = await opened.joinDocument(mainDocumentId);
    await expect(
      opened.applyOperations(
        mainDocumentId,
        document.version,
        [{ p: 47, i: "brave new " }],
        generateTrackedChangeIdSeed(),
      ),
    ).rejects.toThrow(/not authorized/i);
  });

  it("accepts a suggestion from a reviewer, who may not write plain text", async () => {
    remote.permissionsLevel = "review";
    const opened = await openSession();
    const document = await opened.joinDocument(mainDocumentId);

    await opened.applyOperations(
      mainDocumentId,
      document.version,
      [{ p: 47, i: "brave new " }],
      generateTrackedChangeIdSeed(),
    );
    expect(remote.trackedChanges(mainDocumentId)).toHaveLength(1);

    await expect(
      opened.applyOperations(mainDocumentId, document.version, [{ p: 47, i: "plain " }]),
    ).rejects.toThrow(/not authorized/i);
  });

  it("surfaces Overleaf's own refusal rather than a generic failure", async () => {
    const opened = await openSession();
    const document = await opened.joinDocument(mainDocumentId);
    remote.rejectNextUpdateWith = "update is too large";
    await expect(
      opened.applyOperations(mainDocumentId, document.version, [{ p: 0, i: "x" }]),
    ).rejects.toThrow(/update is too large/);
  });

  it("will not send an update for a document it never opened", async () => {
    const opened = await openSession();
    await expect(opened.applyOperations(mainDocumentId, 0, [{ p: 0, i: "x" }])).rejects.toThrow(
      /has not been opened/i,
    );
  });
});

describe("review-panel comments", () => {
  let remote: FakeOverleafRealtime;
  let mainDocumentId: string;
  let session: OverleafRealtimeSession | undefined;

  beforeEach(async () => {
    remote = await FakeOverleafRealtime.start();
    mainDocumentId = remote.addDocument("main.tex", PAPER);
  });

  afterEach(async () => {
    session?.close();
    session = undefined;
    await remote.stop();
  });

  it("reads the passage a comment is anchored to and its thread", async () => {
    remote.addComment(mainDocumentId, "Hello world.", 41, "65aaaaaaaaaaaaaaaaaaaaaa");
    session = await OverleafRealtimeSession.open({
      baseUrl: remote.baseUrl,
      cookieHeader: remote.cookieHeader,
      overleafProjectId: remote.projectId,
      connectTimeoutMs: 5_000,
      callTimeoutMs: 5_000,
    });
    const document = await session.joinDocument(mainDocumentId);
    expect(document.ranges.comments).toEqual([
      {
        commentId: "65aaaaaaaaaaaaaaaaaaaaaa",
        threadId: "65aaaaaaaaaaaaaaaaaaaaaa",
        quotedText: "Hello world.",
        position: 41,
      },
    ]);
  });

  it("anchors a new comment without needing write permission", async () => {
    remote.permissionsLevel = "readOnly";
    session = await OverleafRealtimeSession.open({
      baseUrl: remote.baseUrl,
      cookieHeader: remote.cookieHeader,
      overleafProjectId: remote.projectId,
      connectTimeoutMs: 5_000,
      callTimeoutMs: 5_000,
    });
    const document = await session.joinDocument(mainDocumentId);
    await session.applyOperations(mainDocumentId, document.version, [
      { p: 41, c: "Hello world.", t: "65bbbbbbbbbbbbbbbbbbbbbb" },
    ]);

    const reread = await session.joinDocument(mainDocumentId);
    expect(reread.ranges.comments.map((comment) => comment.threadId)).toContain("65bbbbbbbbbbbbbbbbbbbbbb");
  });
});

describe("finding a document by path", () => {
  it("accepts a path, a leading slash, and a raw document id", async () => {
    const remote = await FakeOverleafRealtime.start();
    const documentId = remote.addDocument("sections/introduction.tex", "Text.");
    const session = await OverleafRealtimeSession.open({
      baseUrl: remote.baseUrl,
      cookieHeader: remote.cookieHeader,
      overleafProjectId: remote.projectId,
      connectTimeoutMs: 5_000,
    });
    try {
      expect(findDocument(session.project, "sections/introduction.tex")?.documentId).toBe(documentId);
      expect(findDocument(session.project, "/sections/introduction.tex")?.documentId).toBe(documentId);
      expect(findDocument(session.project, documentId)?.documentId).toBe(documentId);
      expect(findDocument(session.project, "missing.tex")).toBeUndefined();
    } finally {
      session.close();
      await remote.stop();
    }
  });
});
