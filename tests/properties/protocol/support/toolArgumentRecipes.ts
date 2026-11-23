import { SEEDED_MAIN_FILE } from "./fuzzedProject.js";

/**
 * The argument sets each action of a tool takes, as its description states them. A random
 * subset of a tool's arguments mostly earns a refusal of the combination, so half the runs
 * call with one of these instead, filled from the generated values, to reach the work itself.
 * Some also fix the path to the main file, where the text, the comment thread and the
 * suggestion they act on are, since a generated path seldom names it.
 */
export interface ArgumentRecipe {
  /** Arguments with a fixed value, such as the action or view. */
  readonly fixed: Readonly<Record<string, unknown>>;
  /** Arguments always sent, with generated values. */
  readonly uses: readonly string[];
  /** Arguments a run may send or leave out. */
  readonly mayUse?: readonly string[];
}

const LIFECYCLE_ACTIONS = ["archive", "unarchive", "trash", "untrash"];

export const TOOL_ARGUMENT_RECIPES: Readonly<Record<string, readonly ArgumentRecipe[]>> = {
  read_project: [
    { fixed: { view: "overview" }, uses: [] },
    { fixed: { view: "files" }, uses: [], mayUse: ["extension", "includeUntracked"] },
    { fixed: { view: "outline" }, uses: [], mayUse: ["path", "followIncludes"] },
    { fixed: { view: "status" }, uses: [] },
    { fixed: { view: "changes" }, uses: [], mayUse: ["path"] },
    { fixed: { view: "members" }, uses: [] },
    { fixed: { view: "word_count" }, uses: [], mayUse: ["path"] },
  ],
  read_file: [
    { fixed: {}, uses: ["path"], mayUse: ["startLine", "endLine"] },
    { fixed: {}, uses: ["path", "sectionTitle"] },
    { fixed: { mode: "full" }, uses: ["path"] },
    { fixed: { mode: "smart" }, uses: ["path", "previousRevision"] },
    { fixed: {}, uses: ["path", "revision"], mayUse: ["startLine", "endLine"] },
    { fixed: { followIncludes: true }, uses: ["path"] },
  ],
  read_history: [
    { fixed: { view: "commits" }, uses: [], mayUse: ["path", "since", "until", "limit"] },
    { fixed: { view: "diff" }, uses: ["fromRevision"], mayUse: ["toRevision", "path"] },
    { fixed: { view: "blame" }, uses: ["path"], mayUse: ["startLine", "endLine"] },
  ],
  look_up_citations: [
    { fixed: { action: "verify" }, uses: [], mayUse: ["keys", "mainTexFile", "maximumEntries"] },
    { fixed: { action: "find" }, uses: ["queries"] },
  ],
  edit_file: [
    {
      fixed: { action: "replace_text" },
      uses: ["path", "findText", "replaceWith"],
      mayUse: ["replaceAll", "expectedRevision"],
    },
    {
      fixed: { action: "replace_section" },
      uses: ["path", "sectionTitle", "content"],
      mayUse: ["expectedRevision"],
    },
    { fixed: { action: "write" }, uses: ["path", "content"], mayUse: ["expectedRevision"] },
    { fixed: { action: "append" }, uses: ["path", "content"], mayUse: ["expectedRevision"] },
    {
      fixed: { action: "replace_text", path: SEEDED_MAIN_FILE },
      uses: ["findText", "replaceWith"],
      mayUse: ["replaceAll"],
    },
    { fixed: { action: "replace_section", path: SEEDED_MAIN_FILE }, uses: ["sectionTitle", "content"] },
  ],
  manage_files: [
    { fixed: { action: "delete" }, uses: ["path"] },
    { fixed: { action: "move" }, uses: ["path", "toPath"] },
    { fixed: { action: "upload" }, uses: ["path", "sourcePath"] },
    { fixed: { action: "upload" }, uses: ["path", "contentBase64"] },
    { fixed: { action: "restore" }, uses: ["path", "revision"] },
    { fixed: { action: "discard_local_changes" }, uses: [] },
    { fixed: { action: "create_folder" }, uses: ["path"] },
  ],
  manage_tracked_changes: [
    { fixed: { action: "suggest" }, uses: ["path", "findText", "replaceWith"] },
    { fixed: { action: "suggest" }, uses: ["path", "content"], mayUse: ["sectionTitle"] },
    { fixed: { action: "accept" }, uses: ["path", "changeIds"] },
    { fixed: { action: "accept", all: true }, uses: ["path"] },
    { fixed: { action: "reject" }, uses: ["path", "changeIds"] },
    { fixed: { action: "reject", all: true }, uses: ["path"] },
    { fixed: { action: "suggest", path: SEEDED_MAIN_FILE }, uses: ["findText", "replaceWith"] },
    { fixed: { action: "suggest", path: SEEDED_MAIN_FILE }, uses: ["content", "sectionTitle"] },
    { fixed: { action: "accept", path: SEEDED_MAIN_FILE }, uses: ["changeIds"] },
    { fixed: { action: "accept", path: SEEDED_MAIN_FILE, all: true }, uses: [] },
    { fixed: { action: "reject", path: SEEDED_MAIN_FILE, all: true }, uses: [] },
  ],
  manage_comments: [
    { fixed: { action: "add" }, uses: ["path", "quoteText", "message"] },
    { fixed: { action: "reply" }, uses: ["threadId", "message"] },
    { fixed: { action: "resolve" }, uses: ["path", "threadId"] },
    { fixed: { action: "reopen" }, uses: ["path", "threadId"] },
    { fixed: { action: "delete" }, uses: ["path", "threadId"] },
    { fixed: { action: "edit_message" }, uses: ["threadId", "messageId", "message"] },
    { fixed: { action: "delete_message" }, uses: ["threadId", "messageId"] },
    { fixed: { action: "add", path: SEEDED_MAIN_FILE }, uses: ["quoteText", "message"] },
    { fixed: { action: "resolve", path: SEEDED_MAIN_FILE }, uses: ["threadId"] },
    { fixed: { action: "reopen", path: SEEDED_MAIN_FILE }, uses: ["threadId"] },
  ],
  manage_project: [
    { fixed: { action: "create" }, uses: ["name"], mayUse: ["template"] },
    { fixed: { action: "create_from_zip" }, uses: ["sourcePath"], mayUse: ["name"] },
    { fixed: { action: "copy" }, uses: ["project", "name"] },
    { fixed: { action: "rename" }, uses: ["project", "name"] },
    ...LIFECYCLE_ACTIONS.map((action) => ({ fixed: { action }, uses: ["project"] })),
    { fixed: { action: "tag" }, uses: ["project", "tag"] },
    { fixed: { action: "untag" }, uses: ["project", "tag"] },
    {
      fixed: { action: "update_settings" },
      uses: ["project"],
      mayUse: ["compiler", "rootDocument", "spellCheckLanguage", "texLiveImage", "trackChanges"],
    },
    { fixed: { action: "download_zip" }, uses: ["project", "saveTo"] },
  ],
};

/** How one run picks its arguments: a random subset of them, or a recipe and what it may add. */
export interface ArgumentChoice {
  /** -1 for a random subset. */
  readonly recipeIndex: number;
  readonly optionalNames: readonly string[];
  readonly mayUseMask: readonly boolean[];
}

function pick(values: Readonly<Record<string, unknown>>, names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(names.filter((name) => name in values).map((name) => [name, values[name]]));
}

/** The arguments of one call, from the generated values and the run's choice. */
export function callArgumentsFor(
  toolName: string,
  required: readonly string[],
  values: Readonly<Record<string, unknown>>,
  choice: ArgumentChoice,
): Record<string, unknown> {
  const recipe = TOOL_ARGUMENT_RECIPES[toolName]?.[choice.recipeIndex];
  if (!recipe) return pick(values, [...required, ...choice.optionalNames]);
  const optional = [...(recipe.mayUse ?? []), ...(recipe.uses.includes("project") ? [] : ["project"])];
  const chosen = optional.filter((_, index) => choice.mayUseMask[index % choice.mayUseMask.length]);
  return { ...pick(values, [...recipe.uses, ...chosen]), ...recipe.fixed };
}
