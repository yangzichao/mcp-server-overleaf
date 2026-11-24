import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";

/**
 * Overleaf's own word count, which runs texcount on its compile servers:
 * `GET /project/:id/wordcount` (`CompileController.wordCount`, read access). The editor's
 * `word-count-modal/components/word-count-server.tsx` passes `clsiserverid` from its last
 * compile; `file` picks the document to count and defaults to the main document. The answer is
 * `{ texcount: … }` with the fields of `ServerWordCountData`.
 */

export interface ProjectWordCount {
  readonly textWords: number;
  readonly headingWords: number;
  /** texcount's "words outside text": captions and the like. */
  readonly wordsOutsideText: number;
  readonly headingCount: number;
  /** Figures, tables and other floats. */
  readonly floatCount: number;
  readonly inlineMathCount: number;
  readonly displayMathCount: number;
  readonly errorCount: number;
  /** texcount's own warnings, such as a file it could not read. */
  readonly messages: string;
}

export interface WordCountOptions {
  /** A document path; omitted, Overleaf counts the main document and what it includes. */
  readonly filePath?: string;
  /** The compile server of a recent compile, so the count runs where the files already are. */
  readonly clsiServerId?: string;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Exported for tests. */
export function readWordCount(payload: unknown): ProjectWordCount {
  const texcount =
    payload && typeof payload === "object" ? (payload as { texcount?: unknown }).texcount : undefined;
  const counts = (texcount && typeof texcount === "object" ? texcount : {}) as Record<string, unknown>;
  return {
    textWords: readCount(counts.textWords),
    headingWords: readCount(counts.headWords),
    wordsOutsideText: readCount(counts.outside),
    headingCount: readCount(counts.headers),
    floatCount: readCount(counts.elements),
    inlineMathCount: readCount(counts.mathInline),
    displayMathCount: readCount(counts.mathDisplay),
    errorCount: readCount(counts.errors),
    messages: typeof counts.messages === "string" ? counts.messages.trim() : "",
  };
}

export async function fetchWordCount(
  client: OverleafWebClient,
  projectId: string,
  options: WordCountOptions = {},
): Promise<ProjectWordCount> {
  const query = new URLSearchParams();
  if (options.filePath) query.set("file", options.filePath.replace(/^\.?\//, ""));
  if (options.clsiServerId) query.set("clsiserverid", options.clsiServerId);
  const search = query.toString();
  const path = `/project/${requireOverleafId(projectId, "Project id")}/wordcount${search ? `?${search}` : ""}`;
  return readWordCount(await client.getJson(path, { timeoutMs: 120_000 }));
}
