import fc from "fast-check";

import type { PropertyValuePools } from "./jsonSchemaArbitrary.js";

export interface KnownProjectValues {
  readonly projectId: string;
  readonly filePaths: readonly string[];
  readonly sectionTitles: readonly string[];
  readonly commitHashes: readonly string[];
  readonly fileRevisions: readonly string[];
  readonly threadIds: readonly string[];
  readonly messageIds: readonly string[];
  readonly changeIds: readonly string[];
  readonly citationKeys: readonly string[];
  readonly registeredDoi: string;
  readonly sandboxPaths: readonly string[];
}

function mostly<T>(common: readonly T[], rare: readonly T[]): fc.Arbitrary<T> {
  return fc.oneof(
    { arbitrary: fc.constantFrom(...common), weight: 5 },
    { arbitrary: fc.constantFrom(...rare), weight: 1 },
  );
}

const NEW_PROJECT_PATHS = ["new.tex", "sections/new.tex", "figures/new.png", "a b.tex", "ünï.tex", "notes/"];
const AWKWARD_PROJECT_PATHS = [
  "",
  ".",
  "..",
  "../outside.tex",
  "/etc/hosts",
  "sections",
  "sections/",
  "./main.tex",
  "main.tex/",
  "main.tex/inside.tex",
  ".git/config",
  "C:\\paper.tex",
  "a\\b.tex",
  "sections/../main.tex",
  "MAIN.TEX",
];

export function fuzzedArgumentPools(known: KnownProjectValues): PropertyValuePools {
  const projectPath = mostly([...known.filePaths, ...NEW_PROJECT_PATHS], AWKWARD_PROJECT_PATHS);
  const commitRevision = fc.constantFrom(
    ...known.commitHashes,
    ...known.commitHashes.map((hash) => hash.slice(0, 7)),
  );
  return {
    project: mostly(
      ["paper"],
      [known.projectId, `https://www.overleaf.com/project/${known.projectId}`, "missing", "PAPER", ""],
    ),
    path: projectPath,
    toPath: projectPath,
    mainTexFile: projectPath,
    rootDocument: projectPath,
    sectionTitle: mostly(known.sectionTitles, ["intro", "Missing", "", "\\section{Method}"]),
    findText: mostly(["Hello", "\\section{Method}", "the", "\n"], ["zzz", "", "\\"]),
    replaceWith: fc.constantFrom("Hi.", "", "$1 $& $$", "\\end{document}", "😀\n"),
    content: fc.constantFrom(
      "Hi.\n",
      "",
      "\\section{Method}\nNew words.\n",
      "\\section{Results}\nMore.\n",
      "\\end{document}\n",
      "😀",
    ),
    quoteText: mostly(["Hello", "Method", "world"], ["missing", "\n"]),
    message: fc.constantFrom("Looks right.", "Ünïcode ✓", "two\nlines"),
    commitMessage: fc.constantFrom("Fix a typo", "", " ", "Ünïcode ✓", "two\nlines"),
    query: mostly(["Method", "\\cite", "Hello", "[a-z]+"], ["(", "(a+)+$", ".*", "", "\\"]),
    isRegularExpression: fc.boolean(),
    keys: mostly(known.citationKeys, ["missing2020", "", "KNUTH1984"]),
    queries: mostly([known.registeredDoi, "Literate Programming"], ["10.9999/missing", "", "doi:"]),
    revision: commitRevision,
    fromRevision: commitRevision,
    toRevision: commitRevision,
    expectedRevision: fc.constantFrom(...known.fileRevisions),
    previousRevision: fc.constantFrom(...known.fileRevisions),
    threadId: fc.constantFrom(...known.threadIds),
    messageId: fc.constantFrom(...known.messageIds),
    changeIds: mostly(known.changeIds, ["", "missing"]),
    sourcePath: mostly(known.sandboxPaths, ["relative.png", ""]),
    saveTo: mostly(known.sandboxPaths, ["relative.zip", ""]),
    contentBase64: fc.constantFrom("aGVsbG8=", "", "!!!", "AAAA", "iVBORw0KGgo="),
    name: mostly(["Copy of paper", "Renamed paper"], ["a/b", " ", "x".repeat(150), "x".repeat(151)]),
    tag: mostly(["fuzz", "Tag With Spaces"], ["x".repeat(50), " "]),
    email: mostly(
      ["ada@example.com", "bea@example.com", "invited.coauthor@example.com", "new.coauthor@example.com"],
      [
        "you@example.com",
        " BEA@Example.COM ",
        "",
        "a@b",
        "Ada <ada@example.com>",
        "ada@example.com, bea@example.com",
        "ada@@example.com",
      ],
    ),
    nameContains: fc.constantFrom("paper", "", "Fake", "ZZZ"),
    spellCheckLanguage: fc.constantFrom("en", "de", "zz", ""),
    texLiveImage: fc.constantFrom("texlive-full:2025.1", "texlive-full:1999.1", ""),
    since: fc.constantFrom("2020-01-01", "yesterday", "not a date", "", "2100-01-01"),
    until: fc.constantFrom("2020-01-01", "now", "not a date", "", "2100-01-01"),
    extension: fc.constantFrom(".tex", "bib", "png", "TEX", "md"),
  };
}
