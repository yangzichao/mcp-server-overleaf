import {
  MEMBERS_VIEW_SENTENCE,
  WORD_COUNT_PATH_NOTE,
  WORD_COUNT_VIEW_SENTENCE,
} from "./webProjectViews/webProjectViewDescriptions.js";

/**
 * The Git version of read_project, described for what the configuration lists: the clone views
 * always, and members and word_count when the session cookie can serve them.
 */

const CLONE_VIEW_SENTENCES = [
  "overview, the default, orients at the start of a task: the absolute path of the local Git clone this server edits, the likely main document and its section count, file counts by kind, and local work not yet pushed.",
  "files lists every path grouped by kind (LaTeX sources, bibliographies, figures, other), including files sparse checkout keeps off disk.",
  "outline lists the sectioning commands of path, or of the likely main document, with nesting and line ranges, following \\input and \\include into the files it includes; commented-out headings are skipped.",
  "status reports the clone against Overleaf: branch and head, commits just pulled, local commits not yet pushed, files edited but not committed, and the last ten commits.",
  "changes shows the unified diff push_changes would publish: uncommitted edits, new and deleted files, and commits left behind by a refused push.",
];

const PULL_SENTENCE_CLONE_ONLY =
  "Every view except changes pulls from Overleaf first; if that pull conflicts with unpushed local work, the call fails and keeps the work, except in status, which reports the conflict as a WARNING. changes does not pull, so it compares against Overleaf as last fetched.";

const PULL_SENTENCE_WITH_ACCOUNT_VIEWS =
  "overview, files, outline and status pull from Overleaf first; if that pull conflicts with unpushed local work, the call fails and keeps the work, except in status, which reports the conflict as a WARNING. changes does not pull, so it compares against Overleaf as last fetched. members and word_count read Overleaf itself through the session cookie and leave the clone alone; word_count counts what has been pushed, and a path there that is not an editable document fails and names the ones that exist.";

export function describeReadProjectTool(accountViewsOffered: boolean): string {
  return [
    "Read one project as a whole; view picks what.",
    ...CLONE_VIEW_SENTENCES,
    ...(accountViewsOffered ? [MEMBERS_VIEW_SENTENCE, WORD_COUNT_VIEW_SENTENCE] : []),
    "Use read_file for one file's text, search_project to find which file mentions something, and read_history for older versions.",
    "The likely main document is a guess (main.tex, paper.tex, manuscript.tex, root.tex, thesis.tex or article.tex at the root, otherwise the shallowest .tex file), and the reply says when it has no \\begin{document}.",
    accountViewsOffered ? PULL_SENTENCE_WITH_ACCOUNT_VIEWS : PULL_SENTENCE_CLONE_ONLY,
    "project can name any project the default token reaches, registered or not; the first call on a project clones it, so it is slower than later calls.",
    'Returns plain text, cut off after 60,000 characters; "No local changes pending." means there is nothing to push.',
  ].join(" ");
}

export function describeReadProjectViewArgument(accountViewsOffered: boolean): string {
  const accountViews = accountViewsOffered
    ? ", changes (the diff push_changes would publish), members (who the project is shared with) or word_count (Overleaf's word count)"
    : " or changes (the diff push_changes would publish)";
  return `What to read (default "overview"): overview (where to start), files (every path by kind), outline (sectioning commands), status (commits against Overleaf)${accountViews}.`;
}

export function describeReadProjectPathArgument(accountViewsOffered: boolean): string {
  const base =
    "outline view: the .tex file to outline, relative to the project root, default the likely main document. changes view: only this file or directory, default the whole project.";
  return accountViewsOffered ? `${base} ${WORD_COUNT_PATH_NOTE}` : base;
}
