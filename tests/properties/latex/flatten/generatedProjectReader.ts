import type { ProjectSourceReader } from "../../../../src/latex/includes/walkIncludedFiles.js";
import { UNREADABLE_MESSAGE } from "./expectedFlattening.js";
import { type GeneratedProject, renderFile } from "./generatedLatexProject.js";

/** The project as the flattener reads it, recording every path it asks for. */
export function generatedProjectReader(
  project: GeneratedProject,
): ProjectSourceReader & { readonly reads: string[] } {
  const reads: string[] = [];
  const texts = new Map([...project.textFiles].map(([path, file]) => [path, renderFile(file)]));
  return {
    reads,
    projectFiles: new Set([...texts.keys(), ...project.binaryFiles]),
    readTextFile(path: string): Promise<string> {
      reads.push(path);
      const text = texts.get(path);
      return text === undefined ? Promise.reject(new Error(UNREADABLE_MESSAGE)) : Promise.resolve(text);
    },
  };
}
