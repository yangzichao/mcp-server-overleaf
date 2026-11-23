/**
 * Keys already in use, so a new entry never repeats one. BibTeX warns about keys that differ
 * only in case and biber treats them as distinct, so they are compared ignoring case.
 */
export class CitationKeyRegistry {
  private readonly takenKeys = new Set<string>();

  constructor(takenKeys: Iterable<string> = []) {
    for (const key of takenKeys) this.reserve(key);
  }

  /** The stem itself when it is free, otherwise the stem with `b`, `c`, ... and then numbers. */
  firstFreeKey(stem: string): string {
    for (let attempt = 1; ; attempt += 1) {
      const key = attempt === 1 ? stem : `${stem}${keySuffix(attempt)}`;
      if (!this.takenKeys.has(key.toLowerCase())) return key;
    }
  }

  reserve(key: string): void {
    this.takenKeys.add(key.toLowerCase());
  }
}

/** The second work with a stem gets `b`, reading the first as `a`; after `z`, the attempt's number. */
function keySuffix(attempt: number): string {
  return attempt <= 26 ? String.fromCharCode("a".charCodeAt(0) + attempt - 1) : String(attempt);
}
