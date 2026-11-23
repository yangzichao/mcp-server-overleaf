import fc from "fast-check";

/**
 * Small LaTeX projects built from known pieces, so a test knows where every include directive,
 * comment and verbatim block is without parsing the text it renders. File names repeat across
 * directives, so includes form cycles, include a file twice, and include the root.
 */

export type GeneratedDirective =
  | {
      readonly kind: "simple";
      readonly command: "input" | "include" | "subfile";
      readonly fileName: string;
      /** A space between the command and its brace, which TeX allows. */
      readonly spaceBeforeBrace: boolean;
      /** Spaces inside the braces, which the directive reader trims. */
      readonly paddedName: boolean;
    }
  | {
      readonly kind: "import";
      readonly command:
        | "import"
        | "subimport"
        | "inputfrom"
        | "subinputfrom"
        | "includefrom"
        | "subincludefrom";
      readonly importDirectory: string;
      readonly fileName: string;
      readonly starred: boolean;
    };

export type LinePiece =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "directive"; readonly directive: GeneratedDirective };

export type GeneratedLine =
  | { readonly kind: "line"; readonly pieces: readonly LinePiece[]; readonly comment: string }
  | {
      readonly kind: "opaque";
      readonly environment: "verbatim" | "comment" | "lstlisting";
      readonly body: readonly string[];
    };

export interface GeneratedFile {
  readonly lines: readonly GeneratedLine[];
  readonly lineEnd: "\n" | "\r\n";
  readonly finalNewline: boolean;
}

export interface GeneratedProject {
  readonly textFiles: ReadonlyMap<string, GeneratedFile>;
  /** In the project but not readable as text, as a figure named .tex would be. */
  readonly binaryFiles: readonly string[];
}

export const ROOT_PATH = "main.tex";
const OTHER_TEXT_FILES = ["a.tex", "b.tex", "c.tex", "sub/d.tex", "sub/e.tex"] as const;
export const BINARY_FILE = "binary.tex";

/** Names that resolve, miss, climb out of the project, start at the root, or name the root itself. */
const SIMPLE_FILE_NAMES = [
  "a",
  "a.tex",
  "b",
  "c.tex",
  "sub/d",
  "d",
  "e",
  "./b",
  "sub/../a",
  "main",
  "binary",
  "missing",
  "../a",
  "/a",
  "C:/a",
];
const IMPORT_DIRECTORIES = ["sub/", "sub", "", "./", "../", "/abs/"];
const IMPORT_FILE_NAMES = ["d", "e", "a", "missing", "../a"];

/**
 * Text that holds no directive, comment, `\begin{document}` or `\endinput`, and never ends in a
 * lone backslash: followed by `\input`, that would make TeX read `\\` and the word "input".
 */
const TEXT_PIECES = [
  "word",
  " ",
  "  ",
  "\t",
  "Intro.",
  "x y",
  "{group}",
  "{",
  "}",
  "$m$",
  "é",
  "论文",
  "𝔸",
  "\\emph{e}",
  "\\\\",
  "\\%",
  "100\\%",
  "\\section{S}",
  "\\input{\\dir/x}",
  "#",
  "&",
];
const COMMENTS = ["", "", "%", "% note", "% \\input{a}", "%\\include{b}", "% \\import{sub/}{d}"];
const OPAQUE_BODY_LINES = ["\\input{a}", "\\include{b}", "\\import{sub/}{d}", "plain", "% c", ""];

const simpleDirective: fc.Arbitrary<GeneratedDirective> = fc.record({
  kind: fc.constant("simple" as const),
  command: fc.constantFrom("input" as const, "include" as const, "subfile" as const),
  fileName: fc.constantFrom(...SIMPLE_FILE_NAMES),
  spaceBeforeBrace: fc.boolean(),
  paddedName: fc.boolean(),
});
const importDirective: fc.Arbitrary<GeneratedDirective> = fc.record({
  kind: fc.constant("import" as const),
  command: fc.constantFrom(
    "import" as const,
    "subimport" as const,
    "inputfrom" as const,
    "subinputfrom" as const,
    "includefrom" as const,
    "subincludefrom" as const,
  ),
  importDirectory: fc.constantFrom(...IMPORT_DIRECTORIES),
  fileName: fc.constantFrom(...IMPORT_FILE_NAMES),
  starred: fc.boolean(),
});

const linePiece: fc.Arbitrary<LinePiece> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...TEXT_PIECES).map((text) => ({ kind: "text" as const, text })) },
  {
    weight: 2,
    arbitrary: fc
      .oneof({ weight: 3, arbitrary: simpleDirective }, { weight: 1, arbitrary: importDirective })
      .map((directive) => ({ kind: "directive" as const, directive })),
  },
);

const generatedLine: fc.Arbitrary<GeneratedLine> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant("line" as const),
      pieces: fc.array(linePiece, { maxLength: 5 }),
      comment: fc.constantFrom(...COMMENTS),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("opaque" as const),
      environment: fc.constantFrom("verbatim" as const, "comment" as const, "lstlisting" as const),
      body: fc.array(fc.constantFrom(...OPAQUE_BODY_LINES), { maxLength: 3 }),
    }),
  },
);

export const generatedFile: fc.Arbitrary<GeneratedFile> = fc.record({
  lines: fc.array(generatedLine, { maxLength: 6 }),
  lineEnd: fc.constantFrom("\n" as const, "\r\n" as const),
  finalNewline: fc.boolean(),
});

export const generatedProject: fc.Arbitrary<GeneratedProject> = fc
  .record({
    root: generatedFile,
    others: fc
      .subarray([...OTHER_TEXT_FILES])
      .chain((paths) => fc.tuple(...paths.map((path) => generatedFile.map((file) => [path, file] as const)))),
    hasBinaryFile: fc.boolean(),
  })
  .map(({ root, others, hasBinaryFile }) => ({
    textFiles: new Map<string, GeneratedFile>([[ROOT_PATH, root], ...others]),
    binaryFiles: hasBinaryFile ? [BINARY_FILE] : [],
  }));

export function renderDirective(directive: GeneratedDirective): string {
  if (directive.kind === "import") {
    return `\\${directive.command}${directive.starred ? "*" : ""}{${directive.importDirectory}}{${directive.fileName}}`;
  }
  const padding = directive.paddedName ? " " : "";
  return `\\${directive.command}${directive.spaceBeforeBrace ? " " : ""}{${padding}${directive.fileName}${padding}}`;
}

export function renderOpaqueBlock(
  block: Extract<GeneratedLine, { kind: "opaque" }>,
  lineEnd: GeneratedFile["lineEnd"],
): string {
  return [`\\begin{${block.environment}}`, ...block.body, `\\end{${block.environment}}`].join(lineEnd);
}

export function renderLine(line: GeneratedLine, lineEnd: GeneratedFile["lineEnd"]): string {
  if (line.kind === "opaque") return renderOpaqueBlock(line, lineEnd);
  const pieces = line.pieces.map((piece) =>
    piece.kind === "text" ? piece.text : renderDirective(piece.directive),
  );
  return pieces.join("") + line.comment;
}

export function renderFile(file: GeneratedFile): string {
  if (file.lines.length === 0) return "";
  const text = file.lines.map((line) => renderLine(line, file.lineEnd)).join(file.lineEnd);
  return file.finalNewline ? `${text}${file.lineEnd}` : text;
}
