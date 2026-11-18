import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { type CitedBibliography, collectCitedRecords } from "../../citations/collectCitedRecords.js";
import { createPublicMetadataServices } from "../../citations/metadataServices/publicMetadataServices.js";
import type { BibliographyRecord } from "../../citations/parseBibliographyRecords.js";
import { verifyBibliographyEntry } from "../../citations/verifyBibliographyEntry.js";
import {
  type CitationLookupEndpoints,
  DEFAULT_CITATION_LOOKUP_ENDPOINTS,
} from "../../config/citationLookupConfiguration.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { chooseRootDocument, mainTexFileArgument } from "./checkReferencesTool.js";
import { describeCitationVerification, type VerifiedRecord } from "./describeCitationVerification.js";
import { createProjectSourceReader } from "./projectSourceReader.js";

const DEFAULT_MAXIMUM_ENTRIES = 30;

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

async function lookUpCitations(
  bibliography: CitedBibliography,
  rootPath: string,
  keys: readonly string[] | undefined,
  maximumEntries: number,
  endpoints: CitationLookupEndpoints,
): Promise<string> {
  const { selected, unknownKeys } = selectRecords(bibliography, keys);
  const files = bibliography.bibliographyFiles.join(", ") || "any bibliography file";
  if (selected.length === 0) {
    return keys
      ? `None of ${unknownKeys.join(", ")} is an entry in ${files}.`
      : `${rootPath} cites no entry in ${files}.`;
  }

  const services = createPublicMetadataServices(endpoints);
  const verified: VerifiedRecord[] = [];
  for (const record of selected.slice(0, maximumEntries)) {
    verified.push({ record, verdict: await verifyBibliographyEntry(record, services) });
  }
  return describeCitationVerification({
    bibliographyFiles: bibliography.bibliographyFiles,
    verified,
    entriesNotLookedUp: selected.length - verified.length,
    keysWithoutEntries: keys ? unknownKeys : bibliography.keysWithoutEntries,
  });
}

export function registerVerifyCitationsTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "verify_citations",
    {
      title: "Verify that citations name real works",
      description:
        "Look up the bibliography entries a document cites, to catch references that point at the wrong work or at nothing, such as a mistyped DOI or a citation made up by a model. " +
        "An entry with a DOI is resolved through doi.org (Crossref, DataCite and mEDRA DOIs), one with an arXiv id through arXiv's API, and any other through a Crossref title search; the registered title must match the entry's. " +
        "This sends each looked-up entry's DOI, arXiv id, or title, first author and year to those public services, and nothing else from the project. arXiv allows one request every three seconds, so arXiv-only entries are slow. " +
        "check_references finds cited keys with no entry at all; this tool checks the entries that exist. Pulls from Overleaf first. " +
        "Returns a verdict line, then entries whose DOI or arXiv id does not resolve or names a different title, then entries no search could confirm, which is weaker evidence because books, theses and web pages are often not in Crossref, then the confirmed ones.",
      inputSchema: z.object({
        project: projectArgument,
        mainTexFile: mainTexFileArgument,
        keys: z
          .array(z.string().min(1))
          .min(1)
          .max(100)
          .optional()
          .describe(
            "Citation keys to look up, cited or not. Omit to look up the cited entries in citation order.",
          ),
        maximumEntries: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(DEFAULT_MAXIMUM_ENTRIES)
          .describe(
            `Look up at most this many entries, between 1 and 100 (default ${DEFAULT_MAXIMUM_ENTRIES}); the reply says how many were left.`,
          ),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, mainTexFile, keys, maximumEntries }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);
          const reader = await createProjectSourceReader(repository);
          const root = await chooseRootDocument(repository, reader.projectFiles, mainTexFile);
          const bibliography = await collectCitedRecords(reader, root.path);
          const endpoints = context.configuration.citationLookup ?? DEFAULT_CITATION_LOOKUP_ENDPOINTS;
          return textResult(
            truncateForModel(await lookUpCitations(bibliography, root.path, keys, maximumEntries, endpoints)),
          );
        }),
      ),
  );
}
