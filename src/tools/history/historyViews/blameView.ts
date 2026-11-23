import type { BlameCommit } from "../../../overleaf/history/blame/blamedCommits.js";
import type { BlameLine, FileBlame } from "../../../overleaf/history/blame/blameFile.js";
import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../../workflow/synchronizeWithOverleaf.js";
import { truncateForModel } from "../../toolContext.js";

export interface BlameRequest {
  readonly path: string;
  readonly startLine: number | undefined;
  readonly endLine: number | undefined;
}

const NOT_COMMITTED = "not committed yet";

/** Line number, then the commit as short hash, day and author, then the line itself. */
function describeBlameLine(line: BlameLine): string {
  const commit = line.commit;
  const origin = commit ? `${commit.shortHash} ${commit.date.slice(0, 10)} ${commit.author}` : NOT_COMMITTED;
  return `${line.lineNumber}\t${origin}\t${line.text}`;
}

/** Each commit once, newest first, in the form the commits view prints. */
function describeCommits(lines: readonly BlameLine[]): string[] {
  const commits = new Map<string, BlameCommit>();
  for (const { commit } of lines) {
    if (commit && !commits.has(commit.hash)) commits.set(commit.hash, commit);
  }
  return [...commits.values()]
    .sort((first, second) => Date.parse(second.date) - Date.parse(first.date))
    .map((commit) => `- ${commit.shortHash}  ${commit.date}  ${commit.author}  ${commit.subject}`);
}

function describeBlame(path: string, blame: FileBlame): string {
  const { lines } = blame;
  const first = lines[0];
  const last = lines.at(-1);
  if (!first || !last) return `${path} is empty, so no line has a commit.`;
  const notes = [
    ...(blame.deletedInClone
      ? [
          `${path} is deleted in the clone and the deletion is not pushed yet; these are its lines as last committed.`,
        ]
      : []),
    ...(lines.some((line) => line.commit === undefined)
      ? [`Lines marked ${NOT_COMMITTED} were changed in the clone and are not pushed.`]
      : []),
  ];
  const commits = describeCommits(lines);
  return [
    `${path}, lines ${first.lineNumber}-${last.lineNumber}, each with the commit that last changed it:`,
    ...lines.map(describeBlameLine),
    ...(commits.length > 0 ? ["", "Commits, newest first:", ...commits] : []),
    ...(notes.length > 0 ? ["", ...notes] : []),
  ].join("\n");
}

/** Who last changed each line, after pulling so a co-author's latest commit is counted. */
export async function describeBlameView(
  repository: OverleafGitRepository,
  request: BlameRequest,
): Promise<string> {
  await requireSynchronizedWithOverleaf(repository);
  const blame = await repository.history().blame(request.path, {
    startLine: request.startLine,
    endLine: request.endLine,
  });
  return truncateForModel(describeBlame(request.path, blame));
}
