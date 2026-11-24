import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FakeMetadataServices } from "../../../integration/fakeMetadataServices.js";
import { FAKE_ZIP_BYTES } from "../../../integration/fakeOverleafAccount.js";
import type { FakeOverleafRealtime } from "../../../integration/fakeOverleafRealtime.js";
import type { FakeOverleafRemote } from "../../../integration/fakeOverleafRemote.js";
import { SMALL_PNG } from "../../../integration/support/testImages.js";
import { writeFakeExecutable } from "../../../support/fakeExecutable.js";

export const SEEDED_MAIN_FILE = "main.tex";

export const SEEDED_TEXT_FILES: Readonly<Record<string, string>> = {
  [SEEDED_MAIN_FILE]: [
    "\\documentclass{article}",
    "\\begin{document}",
    "\\input{sections/intro}",
    "\\section{Method}",
    "\\label{sec:method}",
    "Hello world, as \\cite{knuth1984} said. See Figure~\\ref{fig:plot}.",
    "\\begin{figure}",
    "\\includegraphics{figures/plot.png}",
    "\\caption{A plot.}",
    "\\label{fig:plot}",
    "\\end{figure}",
    "\\bibliographystyle{plain}",
    "\\bibliography{refs}",
    "\\end{document}",
    "",
  ].join("\n"),
  "sections/intro.tex": "\\section{Introduction}\nThe introduction says hello.\n",
  "refs.bib": [
    "@article{knuth1984,",
    "  title = {Literate Programming},",
    "  author = {Knuth, Donald E.},",
    "  journal = {The Computer Journal},",
    "  year = {1984},",
    "  doi = {10.1093/comjnl/27.2.97}",
    "}",
    "",
  ].join("\n"),
  "notes.txt": "Plain notes.\n",
};

export const SEEDED_FIGURE_PATH = "figures/plot.png";
export const SEEDED_SECTION_TITLES = ["Introduction", "Method"];
export const SEEDED_CITATION_KEYS = ["knuth1984"];
export const REGISTERED_DOI = "10.1093/comjnl/27.2.97";
const THREAD_ID = "64f0000000000000000000c1";

export async function seedGitRemote(remote: FakeOverleafRemote): Promise<void> {
  for (const [path, text] of Object.entries(SEEDED_TEXT_FILES)) {
    await remote.collaboratorPushes(path, text, `Add ${path}`);
  }
  await remote.collaboratorPushes(SEEDED_FIGURE_PATH, SMALL_PNG, "Add the figure");
}

export function seedEditor(editor: FakeOverleafRealtime): {
  threadIds: string[];
  messageIds: string[];
  changeIds: string[];
} {
  const documentIds = Object.entries(SEEDED_TEXT_FILES).map(([path, text]) => editor.addDocument(path, text));
  const mainDocumentId = documentIds[0] ?? "";
  editor.tree.upload(editor.tree.ensureFolder("figures"), "plot.png", SMALL_PNG, false);
  const mainText = editor.documentText(mainDocumentId);
  editor.addComment(mainDocumentId, "Hello world", mainText.indexOf("Hello world"), THREAD_ID);
  editor.web.addThread(THREAD_ID, [{ author: "Ada", content: "Is this greeting right?" }]);
  editor.collaboratorSuggests(mainDocumentId, [{ p: mainText.indexOf("world"), i: "big " }]);
  return {
    threadIds: [THREAD_ID],
    messageIds: editor.web.threads.get(THREAD_ID)?.messages.map((message) => message.id) ?? [],
    changeIds: editor.trackedChanges(mainDocumentId).map((change) => change.id),
  };
}

export function seedMetadataServices(metadata: FakeMetadataServices): void {
  metadata.dois.set(REGISTERED_DOI, { title: "Literate Programming" });
  metadata.searchResults = [
    {
      DOI: REGISTERED_DOI,
      title: ["Literate Programming"],
      type: "journal-article",
      author: [{ family: "Knuth", given: "Donald E." }],
      "container-title": ["The Computer Journal"],
      issued: { "date-parts": [[1984]] },
    },
  ];
}

const FAKE_TEXCOUNT = String.raw`
process.stdout.write([
  "File: " + process.argv[process.argv.length - 1],
  "Words in text: 12",
  "Words in headers: 2",
  "Words outside text (captions, etc.): 2",
  "Number of headers: 2",
  "Number of floats/tables/figures: 1",
  "Number of math inlines: 0",
  "Number of math displayed: 0",
  "",
].join("\n"));
`;

export async function seedSandbox(sandboxDirectory: string): Promise<{
  sandboxPaths: string[];
  programDirectory: string;
  environmentFileWithNoCredentials: string;
}> {
  const programDirectory = join(sandboxDirectory, "bin");
  await writeFakeExecutable(
    programDirectory,
    "latexmk",
    'process.stdout.write("Latexmk: fake run\\n"); process.exit(1);',
  );
  await writeFakeExecutable(programDirectory, "texcount", FAKE_TEXCOUNT);
  await mkdir(join(sandboxDirectory, ".hidden"), { recursive: true });
  await mkdir(join(sandboxDirectory, "downloads"), { recursive: true });
  await mkdir(join(sandboxDirectory, "chapter", "figures"), { recursive: true });
  const files: Record<string, Buffer | string> = {
    "upload.png": SMALL_PNG,
    "upload.bib": "@misc{uploaded, title = {Uploaded}}\n",
    "paper.zip": FAKE_ZIP_BYTES,
    "not-a-zip.zip": "plain text\n",
    "existing.zip": FAKE_ZIP_BYTES,
    ".hidden/secret.txt": "not for upload\n",
    "chapter/chapter.tex": "\\section{Chapter}\nWords.\n",
    "chapter/figures/chart.png": SMALL_PNG,
    "chapter/.env": "NOT_FOR_UPLOAD=1\n",
    "empty.env": "",
  };
  for (const [name, content] of Object.entries(files)) await writeFile(join(sandboxDirectory, name), content);
  return {
    sandboxPaths: [
      ...Object.keys(files)
        .filter((name) => name !== "empty.env")
        .map((name) => join(sandboxDirectory, name)),
      join(sandboxDirectory, "missing.png"),
      join(sandboxDirectory, "downloads"),
      join(sandboxDirectory, "chapter"),
      join(sandboxDirectory, "downloads", "project.zip"),
      sandboxDirectory,
    ],
    programDirectory,
    environmentFileWithNoCredentials: join(sandboxDirectory, "empty.env"),
  };
}
