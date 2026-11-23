import type { OverleafWebClient } from "./overleafWebClient.js";

/**
 * Compiling on Overleaf's own servers, the way the editor's Recompile button does.
 *
 * The request is the one `features/pdf-preview/util/compiler.ts` sends to
 * `POST /project/:id/compile`, and the answer is `CompileController.compile`'s: a status and
 * the output files of that build. An output file's `url` is the path on the compile server,
 * which the web application also serves at the same path, so files are fetched from the web
 * origin with the session cookie and never sent to the separate PDF download domain.
 *
 * `file_line_errors=true` asks for `file:line: message` errors, which is what the diagnostics
 * reader looks for. A LaTeX error does not by itself fail the compile: Overleaf runs latexmk
 * with `-f`, so a paper with errors usually still answers "success" with a PDF.
 */

export interface CompileOutputFile {
  readonly path: string;
  readonly url: string;
  readonly type: string | undefined;
}

export interface OverleafCompileResult {
  readonly status: string;
  readonly outputFiles: readonly CompileOutputFile[];
  readonly compileGroup: string | undefined;
  readonly clsiServerId: string | undefined;
}

export interface OverleafCompileOptions {
  /** Root document, as a path; omitted, Overleaf uses the project's own main document setting. */
  readonly rootResourcePath?: string;
  readonly draft: boolean;
  readonly stopOnFirstError: boolean;
}

/** Overleaf allows a compile every few seconds per project; this waits out one refusal. */
const TOO_RECENTLY_COMPILED_RETRY_DELAY_MS = 3_000;
/** Matches `COMPILE_TIMEOUT_MS` in CompileController, plus room for the download. */
const COMPILE_REQUEST_TIMEOUT_MS = 300_000;

export interface CompileTiming {
  readonly retryDelayMs: number;
}

function readOutputFiles(value: unknown): CompileOutputFile[] {
  if (!Array.isArray(value)) return [];
  const files: CompileOutputFile[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const file = entry as { path?: unknown; url?: unknown; type?: unknown };
    if (typeof file.path !== "string" || typeof file.url !== "string" || !file.url.startsWith("/")) continue;
    files.push({
      path: file.path,
      url: file.url,
      type: typeof file.type === "string" ? file.type : undefined,
    });
  }
  return files;
}

async function requestCompile(
  client: OverleafWebClient,
  overleafProjectId: string,
  options: OverleafCompileOptions,
): Promise<OverleafCompileResult> {
  const body: Record<string, unknown> = {
    check: "silent",
    draft: options.draft,
    incrementalCompilesEnabled: true,
    stopOnFirstError: options.stopOnFirstError,
  };
  if (options.rootResourcePath) body.rootResourcePath = options.rootResourcePath;
  const answer = (await client.postJson(`/project/${overleafProjectId}/compile?file_line_errors=true`, body, {
    timeoutMs: COMPILE_REQUEST_TIMEOUT_MS,
  })) as
    | { status?: unknown; outputFiles?: unknown; compileGroup?: unknown; clsiServerId?: unknown }
    | undefined;
  return {
    status: typeof answer?.status === "string" ? answer.status : "error",
    outputFiles: readOutputFiles(answer?.outputFiles),
    compileGroup: typeof answer?.compileGroup === "string" ? answer.compileGroup : undefined,
    clsiServerId: typeof answer?.clsiServerId === "string" ? answer.clsiServerId : undefined,
  };
}

export async function compileOnOverleaf(
  client: OverleafWebClient,
  overleafProjectId: string,
  options: OverleafCompileOptions,
  timing: CompileTiming = { retryDelayMs: TOO_RECENTLY_COMPILED_RETRY_DELAY_MS },
): Promise<OverleafCompileResult> {
  const first = await requestCompile(client, overleafProjectId, options);
  if (first.status !== "too-recently-compiled") return first;
  await new Promise((resolve) => setTimeout(resolve, timing.retryDelayMs));
  return await requestCompile(client, overleafProjectId, options);
}

/** The query `pdf-preview/util/file-list.ts` appends, which routes to the right compile server. */
function outputFilePath(file: CompileOutputFile, result: OverleafCompileResult): string {
  const query = new URLSearchParams();
  if (result.compileGroup) query.set("compileGroup", result.compileGroup);
  if (result.clsiServerId) query.set("clsiserverid", result.clsiServerId);
  const search = query.toString();
  return search ? `${file.url}?${search}` : file.url;
}

export async function downloadOutputFile(
  client: OverleafWebClient,
  result: OverleafCompileResult,
  file: CompileOutputFile,
): Promise<Buffer> {
  return (await client.download(outputFilePath(file, result))).bytes;
}

/** What each status the editor handles means to someone who did not see the editor. */
export function explainCompileStatus(status: string): string | undefined {
  const explanations: Record<string, string> = {
    "too-recently-compiled":
      "Overleaf refused because the project was compiled moments ago. Try again in a few seconds.",
    "compile-in-progress":
      "Another compile of this project is still running in Overleaf. Try again when it finishes.",
    timedout: "The compile ran past Overleaf's time limit for this account's plan.",
    terminated: "The compile was stopped before it finished.",
    exited: "The compiler exited before producing output.",
    "project-too-large": "The project is too large for Overleaf to compile.",
    "rate-limited": "Overleaf is rate-limiting compiles for this account. Wait a minute before trying again.",
    "clsi-maintenance": "Overleaf's compile servers are under maintenance.",
    unavailable: "Overleaf's compile servers are unavailable right now.",
    "autocompile-backoff": "Overleaf has paused compiles for this project for a moment.",
    "validation-problems":
      "Overleaf found problems with the project's files before compiling, such as files that are too large or conflicting paths.",
  };
  return explanations[status];
}
