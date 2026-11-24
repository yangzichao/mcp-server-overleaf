/**
 * The settings one update_settings call asks for. Each is optional on its own, but a call has to
 * ask for at least one.
 */

export interface RequestedProjectSettings {
  readonly compiler: string | undefined;
  /** A document path, as the project names it. */
  readonly rootDocument: string | undefined;
  /** A language code, or "" to turn spell checking off. */
  readonly spellCheckLanguage: string | undefined;
  readonly texLiveImage: string | undefined;
  /** On or off for everyone in the project. */
  readonly trackChanges: boolean | undefined;
}

/** "off" and "" both turn spell checking off, as the menu's Off entry does. */
export function readSpellCheckLanguage(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.toLowerCase() === "off" ? "" : trimmed;
}

export function requireSomeSetting(requested: RequestedProjectSettings): void {
  if (Object.values(requested).every((value) => value === undefined)) {
    throw new Error(
      "update_settings needs at least one of compiler, rootDocument, spellCheckLanguage, texLiveImage or trackChanges.",
    );
  }
}

export function describeSpellCheckChoice(code: string): string {
  return code === "" ? "spell check off" : `spell check ${code}`;
}

export function describeTrackChangesChoice(on: boolean): string {
  return `track changes ${on ? "on" : "off"} for everyone`;
}
