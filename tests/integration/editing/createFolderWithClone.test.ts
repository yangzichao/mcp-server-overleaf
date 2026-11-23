import { describe, expect, it } from "vitest";

import { useEditorTestHarness } from "../support/editorTestHarness.js";

describe("manage_files create_folder on a server with a Git credential and a session cookie", () => {
  const harness = useEditorTestHarness();

  it("creates the folder and its missing parents in Overleaf at once, not in the clone", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_files", { action: "create_folder", path: "figures/plots" });
    expect(answer).toBe(
      "Created the folder figures/plots in Overleaf, with its missing parent folder figures. " +
        "It is in Overleaf now; co-authors see it already. " +
        "The local clone will not show it while it is empty, since Git records only files; a file written or uploaded under it here joins it in Overleaf when push_changes publishes it.",
    );
    expect(harness.editor.tree.entityAt("figures")?.type).toBe("folder");
    expect(harness.editor.tree.entityAt("figures/plots")?.type).toBe("folder");
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  });

  it("leaves an existing folder alone and refuses a path that is a file", async () => {
    const client = await harness.startClient();
    expect(await client.call("manage_files", { action: "create_folder", path: "sections" })).toBe(
      "sections is already a folder in Overleaf, so nothing was created.",
    );
    const onFile = await client.callRaw("manage_files", { action: "create_folder", path: "main.tex/inner" });
    expect(onFile.result?.isError).toBe(true);
    expect(onFile.result?.content?.[0]?.text).toContain(
      "main.tex is an editable document in Overleaf, not a folder",
    );
    expect(harness.editor.tree.entityAt("main.tex/inner")).toBeUndefined();
  });

  it("is refused for an account that cannot edit the project", async () => {
    harness.editor.permissionsLevel = "review";
    const client = await harness.startClient();
    const response = await client.callRaw("manage_files", { action: "create_folder", path: "drafts" });
    expect(response.result?.isError).toBe(true);
    expect(response.result?.content?.[0]?.text).toContain("needs edit access");
    expect(harness.editor.tree.entityAt("drafts")).toBeUndefined();
  });

  it("names create_folder among the actions that take path, and takes nothing else", async () => {
    const client = await harness.startClient();
    const discard = await client.callRaw("manage_files", { action: "discard_local_changes", path: "x" });
    expect(discard.result?.content?.[0]?.text).toBe(
      "path does not apply to discard_local_changes; delete, move, upload, restore and create_folder use it.",
    );
    const extra = await client.callRaw("manage_files", { action: "create_folder", path: "x", toPath: "y" });
    expect(extra.result?.content?.[0]?.text).toBe("toPath does not apply to create_folder; move uses it.");
    const missing = await client.callRaw("manage_files", { action: "create_folder" });
    expect(missing.result?.content?.[0]?.text).toBe("create_folder needs path.");
  });
});
