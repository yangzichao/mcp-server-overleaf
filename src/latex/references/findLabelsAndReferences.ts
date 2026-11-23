import { locationOf, type ScannedSource } from "../source/scannedSource.js";
import { type KeyOccurrence, splitKeys } from "./keyOccurrence.js";

/**
 * Labels and the commands that point at them, from LaTeX itself, amsmath, hyperref,
 * varioref, fancyref, cleveref and zref.
 */

const LABEL_PATTERN = /\\(label|zlabel)\s*(?:\[[^[\]]*\]\s*)?\{([^{}]*)\}/g;
/**
 * `label=` in the options of a code listing or a tcolorbox, which is a cross-reference
 * label there. Elsewhere, TikZ above all, `label=` is a node caption and labels nothing.
 */
const LABELLED_OPTIONS_PATTERN =
  /\\(?:begin\s*\{(?:lstlisting|minted|tcolorbox)\}|lstinputlisting|inputminted)\s*\[((?:[^[\]{}]|\{[^{}]*\})*)\]/g;
const OPTION_LABEL_PATTERN = /(?:^|,)\s*label\s*=\s*(?:\{([^{}]*)\}|([^,\s{}]+))/;

const SINGLE_KEY_REFERENCE_COMMANDS = [
  "ref",
  "eqref",
  "pageref",
  "autoref",
  "Autoref",
  "nameref",
  "Nameref",
  "vref",
  "Vref",
  "vpageref",
  "fref",
  "Fref",
  "subref",
  "namecref",
  "nameCref",
  "lcnamecref",
  "zref",
  "zpageref",
];
const KEY_LIST_REFERENCE_COMMANDS = [
  "cref",
  "Cref",
  "cpageref",
  "Cpageref",
  "labelcref",
  "labelcpageref",
  "zcref",
];
const RANGE_REFERENCE_COMMANDS = ["crefrange", "Crefrange", "cpagerefrange", "Cpagerefrange"];

/** Labels packages define without a \label in the source. */
export const PACKAGE_DEFINED_LABELS: ReadonlySet<string> = new Set(["LastPage", "VeryLastPage"]);

const REFERENCE_PATTERN = new RegExp(
  `\\\\(${[...SINGLE_KEY_REFERENCE_COMMANDS, ...KEY_LIST_REFERENCE_COMMANDS].join("|")})(?![A-Za-z])\\*?\\s*(?:\\[[^[\\]]*\\]\\s*){0,2}\\{([^{}]*)\\}`,
  "g",
);
const RANGE_REFERENCE_PATTERN = new RegExp(
  `\\\\(${RANGE_REFERENCE_COMMANDS.join("|")})(?![A-Za-z])\\*?\\s*\\{([^{}]*)\\}\\s*\\{([^{}]*)\\}`,
  "g",
);
const HYPERREF_PATTERN = /\\hyperref\s*\[([^[\]]*)\]/g;

export function findLabels(source: ScannedSource): KeyOccurrence[] {
  const labels: KeyOccurrence[] = [];
  for (const match of source.text.matchAll(LABEL_PATTERN)) {
    for (const key of splitKeys(match[2] ?? "", false)) {
      labels.push({ key, command: match[1] ?? "label", location: locationOf(source, match.index) });
    }
  }
  for (const match of source.text.matchAll(LABELLED_OPTIONS_PATTERN)) {
    const option = OPTION_LABEL_PATTERN.exec(match[1] ?? "");
    for (const key of splitKeys(option?.[1] ?? option?.[2] ?? "", false)) {
      labels.push({ key, command: "label=", location: locationOf(source, match.index) });
    }
  }
  return labels;
}

export function findReferences(source: ScannedSource): KeyOccurrence[] {
  const references: KeyOccurrence[] = [];
  const add = (command: string, writtenKeys: string, allowsList: boolean, index: number): void => {
    for (const key of splitKeys(writtenKeys, allowsList)) {
      references.push({ key, command, location: locationOf(source, index) });
    }
  };

  for (const match of source.text.matchAll(REFERENCE_PATTERN)) {
    const command = match[1] ?? "ref";
    add(command, match[2] ?? "", KEY_LIST_REFERENCE_COMMANDS.includes(command), match.index);
  }
  for (const match of source.text.matchAll(RANGE_REFERENCE_PATTERN)) {
    const command = match[1] ?? "crefrange";
    add(command, match[2] ?? "", false, match.index);
    add(command, match[3] ?? "", false, match.index);
  }
  for (const match of source.text.matchAll(HYPERREF_PATTERN)) {
    add("hyperref", match[1] ?? "", false, match.index);
  }
  return references;
}
