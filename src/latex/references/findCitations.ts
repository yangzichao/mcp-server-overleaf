import { locationOf, type ScannedSource } from "../source/scannedSource.js";
import { type KeyOccurrence, splitKeys } from "./keyOccurrence.js";

/**
 * Citation commands from LaTeX, natbib, biblatex and apacite. Matching any command with
 * "cite" in its name, or starting with "Cite", covers \citep, \parencite, \textcite,
 * \footcite, \nocite, natbib's \Citet and the rest without a list to keep current; the few
 * such commands that take no keys are excluded. biblatex's \DeclareAutoCiteCommand and its
 * kin define commands and cite nothing.
 */

const CITATION_PATTERN = /\\(?=[A-Za-z]*cite|Cite)([A-Za-z]+)\*?((?:\s*\[[^[\]]*\]){0,2})\s*\{([^{}]*)\}/g;
/** biblatex's multicite commands repeat the bracket-and-key group: \cites[see][]{a}[p.~2]{b}. */
const FURTHER_MULTICITE_GROUP = /(?:\s*\[[^[\]]*\]){0,2}\s*\{([^{}]*)\}/y;
const TAKES_NO_KEYS = /(style|setup|true|false|type|color)$/;

export interface CitationScan {
  readonly citations: KeyOccurrence[];
  /** True once the source has \nocite{*}, which cites every entry in the bibliography. */
  readonly citesEveryEntry: boolean;
}

export function findCitations(source: ScannedSource): CitationScan {
  const citations: KeyOccurrence[] = [];
  let citesEveryEntry = false;

  const add = (command: string, writtenKeys: string, index: number): void => {
    for (const key of splitKeys(writtenKeys, true)) {
      if (key === "*") citesEveryEntry = true;
      else citations.push({ key, command, location: locationOf(source, index) });
    }
  };

  for (const match of source.text.matchAll(CITATION_PATTERN)) {
    const command = match[1] ?? "cite";
    if (TAKES_NO_KEYS.test(command)) continue;
    add(command, match[3] ?? "", match.index);
    if (!command.toLowerCase().endsWith("cites")) continue;

    FURTHER_MULTICITE_GROUP.lastIndex = match.index + match[0].length;
    for (
      let group = FURTHER_MULTICITE_GROUP.exec(source.text);
      group;
      group = FURTHER_MULTICITE_GROUP.exec(source.text)
    ) {
      add(command, group[1] ?? "", match.index);
    }
  }

  return { citations, citesEveryEntry };
}
