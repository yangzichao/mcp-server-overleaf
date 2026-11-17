import type { KeyOccurrence } from "./keyOccurrence.js";
import type { DuplicateKey, UndefinedKey } from "./referenceCheckReport.js";

/**
 * The set arithmetic behind the reference check: uses with no definition, definitions made
 * twice, and definitions never used.
 */

function groupByKey(occurrences: readonly KeyOccurrence[], normalize: (key: string) => string) {
  const groups = new Map<string, KeyOccurrence[]>();
  for (const occurrence of occurrences) {
    const normalizedKey = normalize(occurrence.key);
    const group = groups.get(normalizedKey);
    if (group) group.push(occurrence);
    else groups.set(normalizedKey, [occurrence]);
  }
  return groups;
}

export function findDuplicateDefinitions(
  definitions: readonly KeyOccurrence[],
  normalize: (key: string) => string = (key) => key,
): DuplicateKey[] {
  return [...groupByKey(definitions, normalize).values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      key: group[0]?.key ?? "",
      locations: group.map((occurrence) => occurrence.location),
    }));
}

export function findUndefinedUses(
  uses: readonly KeyOccurrence[],
  definedKeys: ReadonlySet<string>,
): UndefinedKey[] {
  const definedByLowerCase = new Map([...definedKeys].map((key) => [key.toLowerCase(), key]));
  return [...groupByKey(uses, (key) => key).values()]
    .filter((group) => !definedKeys.has(group[0]?.key ?? ""))
    .map((group) => {
      const key = group[0]?.key ?? "";
      return {
        key,
        command: group[0]?.command ?? "",
        locations: group.map((occurrence) => occurrence.location),
        differsOnlyInCaseFrom: definedByLowerCase.get(key.toLowerCase()),
      };
    });
}

export function findUnusedDefinitions(
  definitions: readonly KeyOccurrence[],
  usedKeys: ReadonlySet<string>,
): string[] {
  return [...new Set(definitions.map((definition) => definition.key))].filter((key) => !usedKeys.has(key));
}
