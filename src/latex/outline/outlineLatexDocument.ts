import {
  type MissingProjectFile,
  type ProjectSourceReader,
  type VisitedSourceFile,
  walkIncludedFiles,
} from "../includes/walkIncludedFiles.js";
import { type LatexSection, parseLatexSections } from "../parseLatexSections.js";

/**
 * A whole document's headings in reading order, across the files it includes. Each heading
 * keeps its own file and that file's line numbers, which is what read_file (sectionTitle)
 * and edit_file (action replace_section) take.
 */

export interface OutlineHeading {
  readonly path: string;
  readonly section: LatexSection;
}

export interface DocumentOutline {
  readonly headings: OutlineHeading[];
  readonly checkedFiles: string[];
  readonly missingIncludes: MissingProjectFile[];
}

export async function outlineLatexDocument(
  reader: ProjectSourceReader,
  rootPath: string,
): Promise<DocumentOutline> {
  const walk = await walkIncludedFiles(reader, rootPath);
  const filesByPath = new Map(walk.visited.map((file) => [file.path, file]));
  const emitted = new Set<string>();
  const headings: OutlineHeading[] = [];

  function emit(file: VisitedSourceFile): void {
    emitted.add(file.path);
    const sections = parseLatexSections(file.text);
    let nextSection = 0;
    const emitSectionsUpTo = (line: number): void => {
      for (; nextSection < sections.length; nextSection += 1) {
        const section = sections[nextSection];
        if (!section || section.startLine > line) return;
        headings.push({ path: file.path, section });
      }
    };

    for (const include of file.includes) {
      emitSectionsUpTo(file.lineAt(include.directive.index));
      const included = include.includedPath ? filesByPath.get(include.includedPath) : undefined;
      if (included && !emitted.has(included.path)) emit(included);
    }
    emitSectionsUpTo(Number.POSITIVE_INFINITY);
  }

  const root = walk.visited[0];
  if (root) emit(root);
  return {
    headings,
    checkedFiles: walk.visited.map((file) => file.path),
    missingIncludes: walk.missingIncludes,
  };
}
