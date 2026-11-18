/**
 * LaTeX source as the static checks should read it: without comments, and without the
 * bodies of environments whose content TeX never interprets. Every newline is kept, so a
 * line number found in the prepared text is the line number in the file.
 */

/** Removes a `%` comment from one line, keeping an escaped `\%`. */
export function stripLineComment(line: string): string {
  let result = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\") {
      result += line.slice(index, index + 2);
      index += 1;
      continue;
    }
    if (character === "%") break;
    result += character;
  }
  return result;
}

/**
 * Environments printed or dropped verbatim. A `\ref` inside a code listing is text, and a
 * `\label` inside a `comment` environment defines nothing.
 */
const OPAQUE_ENVIRONMENT_PATTERN = /\\begin\s*\{(verbatim\*?|Verbatim\*?|lstlisting|minted|comment)\}/g;

function endOfEnvironmentPattern(environment: string): RegExp {
  return new RegExp(`\\\\end\\s*\\{${environment.replace("*", "\\*")}\\}`, "g");
}

function keepNewlinesOnly(text: string): string {
  return text.replace(/[^\n]/g, "");
}

export function prepareLatexSource(source: string): string {
  const uncommented = source.split("\n").map(stripLineComment).join("\n");
  const beginPattern = new RegExp(OPAQUE_ENVIRONMENT_PATTERN.source, "g");
  let prepared = "";
  let cursor = 0;

  for (let begin = beginPattern.exec(uncommented); begin; begin = beginPattern.exec(uncommented)) {
    // The rest of the \begin line stays: that is where lstlisting and minted take their
    // options, including a label= a \ref elsewhere may point at.
    const bodyStart = uncommented.indexOf("\n", begin.index + begin[0].length);
    if (bodyStart === -1) break;
    const endPattern = endOfEnvironmentPattern(begin[1] ?? "");
    endPattern.lastIndex = bodyStart;
    const end = endPattern.exec(uncommented);
    const bodyEnd = end ? end.index : uncommented.length;

    prepared +=
      uncommented.slice(cursor, bodyStart) + keepNewlinesOnly(uncommented.slice(bodyStart, bodyEnd));
    cursor = bodyEnd;
    beginPattern.lastIndex = end ? end.index + end[0].length : uncommented.length;
  }

  return prepared + uncommented.slice(cursor);
}
