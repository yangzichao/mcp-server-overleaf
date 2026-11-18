/** Where something was found: a project path and a 1-indexed line. */
export interface SourceLocation {
  readonly path: string;
  readonly line: number;
}

/** A file's prepared text together with the means to turn a match index into a line. */
export interface ScannedSource {
  readonly path: string;
  readonly text: string;
  lineAt(index: number): number;
}

export function scanSource(path: string, text: string): ScannedSource {
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }

  return {
    path,
    text,
    lineAt(index: number): number {
      let low = 0;
      let high = lineStarts.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if ((lineStarts[middle] ?? 0) <= index) low = middle;
        else high = middle - 1;
      }
      return low + 1;
    },
  };
}

export function locationOf(source: ScannedSource, index: number): SourceLocation {
  return { path: source.path, line: source.lineAt(index) };
}

export function describeLocation(location: SourceLocation): string {
  return `${location.path}:${location.line}`;
}
