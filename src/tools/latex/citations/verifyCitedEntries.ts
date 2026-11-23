import type { CitedBibliography } from "../../../citations/collectCitedRecords.js";
import { createPublicMetadataServices } from "../../../citations/metadataServices/publicMetadataServices.js";
import type { BibliographyRecord } from "../../../citations/parseBibliographyRecords.js";
import { verifyBibliographyEntry } from "../../../citations/verifyBibliographyEntry.js";
import type { CitationLookupEndpoints } from "../../../config/citationLookupConfiguration.js";
import { describeCitationVerification, type VerifiedRecord } from "../describeCitationVerification.js";
import type { CitationLookupDeadline } from "./citationLookupDeadline.js";

export const DEFAULT_MAXIMUM_ENTRIES = 30;

export interface CitationVerificationRequest {
  readonly bibliography: CitedBibliography;
  readonly rootPath: string;
  /** The keys to look up, cited or not; undefined for the cited entries in citation order. */
  readonly keys: readonly string[] | undefined;
  readonly maximumEntries: number;
  readonly endpoints: CitationLookupEndpoints;
  readonly deadline: CitationLookupDeadline;
}

/** The entries to look up: the named keys, or the cited entries in citation order. */
function selectRecords(
  bibliography: CitedBibliography,
  keys: readonly string[] | undefined,
): { selected: BibliographyRecord[]; unknownKeys: string[] } {
  if (!keys) return { selected: bibliography.records, unknownKeys: [] };
  const byKey = new Map(bibliography.allRecords.map((record) => [record.key, record]));
  return {
    selected: keys.flatMap((key) => {
      const record = byKey.get(key);
      return record ? [record] : [];
    }),
    unknownKeys: keys.filter((key) => !byKey.has(key)),
  };
}

/** look_up_citations (action verify): one entry at a time, until the entries or the time run out. */
export async function verifyCitedEntries(request: CitationVerificationRequest): Promise<string> {
  const { bibliography, keys } = request;
  const { selected, unknownKeys } = selectRecords(bibliography, keys);
  const files = bibliography.bibliographyFiles.join(", ") || "any bibliography file";
  if (selected.length === 0) {
    return keys
      ? `None of ${unknownKeys.join(", ")} is an entry in ${files}.`
      : `${request.rootPath} cites no entry in ${files}.`;
  }

  const services = createPublicMetadataServices(request.endpoints);
  const withinMaximum = selected.slice(0, request.maximumEntries);
  const verified: VerifiedRecord[] = [];
  for (const record of withinMaximum) {
    if (request.deadline.hasPassed()) break;
    verified.push({ record, verdict: await verifyBibliographyEntry(record, services) });
  }
  return describeCitationVerification({
    bibliographyFiles: bibliography.bibliographyFiles,
    verified,
    keysLeftByDeadline: withinMaximum.slice(verified.length).map((record) => record.key),
    deadlineSeconds: request.deadline.budgetSeconds,
    entriesNotLookedUp: selected.length - withinMaximum.length,
    keysWithoutEntries: keys ? unknownKeys : bibliography.keysWithoutEntries,
  });
}
