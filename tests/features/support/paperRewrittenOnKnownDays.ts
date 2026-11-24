import type { FakeOverleafRemote } from "../../integration/fakeOverleafRemote.js";

const draftBeforeRewrite = "We study sample sizes.\nFirst draft.\nThe end.\n";
const draftAfterRewrite = "We study sample sizes.\nSecond draft, much better.\nThe end.\n";

export interface RewriteHistory {
  readonly revisionsBySubject: ReadonlyMap<string, string>;
}

/** Git reads the commit date from the environment of the process that commits. */
async function collaboratorPushesOn(
  remote: FakeOverleafRemote,
  isoDate: string,
  content: string,
  commitMessage: string,
): Promise<void> {
  process.env.GIT_AUTHOR_DATE = isoDate;
  process.env.GIT_COMMITTER_DATE = isoDate;
  try {
    await remote.collaboratorPushes("main.tex", content, commitMessage);
  } finally {
    Reflect.deleteProperty(process.env, "GIT_AUTHOR_DATE");
    Reflect.deleteProperty(process.env, "GIT_COMMITTER_DATE");
  }
}

/** "First draft" on 2026-03-01, then "Rewrite the intro" changing only line 2 on 2026-03-02. */
export async function publishDraftRewrittenOnKnownDays(remote: FakeOverleafRemote): Promise<RewriteHistory> {
  await collaboratorPushesOn(remote, "2026-03-01T10:00:00+00:00", draftBeforeRewrite, "First draft");
  const firstDraft = await remote.publishedHeadHash();
  await collaboratorPushesOn(remote, "2026-03-02T10:00:00+00:00", draftAfterRewrite, "Rewrite the intro");
  const rewrite = await remote.publishedHeadHash();
  return {
    revisionsBySubject: new Map([
      ["First draft", firstDraft],
      ["Rewrite the intro", rewrite],
    ]),
  };
}
