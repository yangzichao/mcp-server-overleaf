import type { FakeOverleafRemote } from "../../integration/fakeOverleafRemote.js";

export const firstDraft = "\\section{Intro}\nFirst draft.\n";
export const secondDraft = "\\section{Intro}\nSecond draft, much better.\n";
export const plotBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0xff,
]);

export interface PublishedHistory {
  readonly firstDraftRevision: string;
  readonly plotAddedRevision: string;
}

export async function publishThreeCommitHistory(remote: FakeOverleafRemote): Promise<PublishedHistory> {
  await remote.collaboratorPushes("main.tex", firstDraft, "First draft");
  const firstDraftRevision = await remote.publishedHeadHash();
  await remote.collaboratorPushes("figures/plot.png", plotBytes, "Add the plot");
  const plotAddedRevision = await remote.publishedHeadHash();
  await remote.collaboratorPushes("main.tex", secondDraft, "Rewrite the intro");
  return { firstDraftRevision, plotAddedRevision };
}
