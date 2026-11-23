/** Characters BibTeX allows in no entry type, field name or macro name. */
const NOT_IN_A_NAME = new Set(['"', "#", "%", "'", "(", ")", ",", "=", "{", "}"]);

function isWhitespace(character: string): boolean {
  return /\s/.test(character);
}

function isDigit(character: string): boolean {
  return character >= "0" && character <= "9";
}

function isNameCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code > 31 && code !== 127 && !NOT_IN_A_NAME.has(character) && !isWhitespace(character);
}

/**
 * Reads .bib text as BibTeX 0.99d does. A read that returns null leaves the position at the first
 * character BibTeX rejects, which is where BibTeX goes on looking for the next `@`.
 */
export class BibliographyCursor {
  constructor(
    readonly text: string,
    public position: number,
  ) {}

  peek(): string {
    return this.text[this.position] ?? "";
  }

  skipWhitespace(): void {
    while (isWhitespace(this.peek())) this.position += 1;
  }

  /** An entry type, field name or macro name, none of which BibTeX lets start with a digit. */
  readName(): string {
    return isDigit(this.peek()) ? "" : this.readWhile(isNameCharacter);
  }

  /**
   * An entry key: everything up to a comma or white space, or up to a `}` when that closes the
   * entry. BibTeX takes `)` into the key of an entry opened with `(`.
   */
  readKey(closer: string): string {
    return this.readWhile(
      (character) => character !== "," && !(closer === "}" && character === "}") && !isWhitespace(character),
    );
  }

  /** A field value: braced or quoted parts, numbers and macro names, joined by `#`. */
  readValue(): string | null {
    const parts: string[] = [];
    for (;;) {
      this.skipWhitespace();
      const part = this.readValuePart();
      if (part === null) return null;
      parts.push(part);
      this.skipWhitespace();
      if (this.peek() !== "#") return parts.join("");
      this.position += 1;
    }
  }

  private readValuePart(): string | null {
    const character = this.peek();
    if (character === "{" || character === '"') return this.readDelimited();
    if (isDigit(character)) return this.readWhile(isDigit);
    // A macro name stands for its @string text, which these readers leave unexpanded.
    const macroName = this.readName();
    return macroName === "" ? null : macroName;
  }

  /**
   * `{...}` or `"..."`, returning what is inside. Every brace counts, since a backslash escapes
   * nothing, and a quoted value ends at a `"` outside braces. A `}` that closes no brace ends a
   * braced value and is an error in a quoted one.
   */
  private readDelimited(): string | null {
    const quoted = this.peek() === '"';
    const start = this.position + 1;
    let depth = 0;
    for (let index = start; index < this.text.length; index += 1) {
      const character = this.text[index];
      if (character === "{") {
        depth += 1;
      } else if (character === "}" && depth > 0) {
        depth -= 1;
      } else if (character === "}" && quoted) {
        this.position = index;
        return null;
      } else if (character === (quoted ? '"' : "}") && depth === 0) {
        this.position = index + 1;
        return this.text.slice(start, index);
      }
    }
    this.position = this.text.length;
    return null;
  }

  private readWhile(accepts: (character: string) => boolean): string {
    const start = this.position;
    while (this.position < this.text.length && accepts(this.peek())) this.position += 1;
    return this.text.slice(start, this.position);
  }
}
