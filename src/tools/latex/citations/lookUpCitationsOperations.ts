import * as z from "zod/v4";

import { collectCitedRecords } from "../../../citations/collectCitedRecords.js";
import { MAXIMUM_CITATION_QUERIES } from "../../../citations/find/findCitations.js";
import { CROSSREF_CANDIDATE_COUNT } from "../../../citations/find/sources/citationSources.js";
import {
  type CitationLookupEndpoints,
  DEFAULT_CITATION_LOOKUP_ENDPOINTS,
} from "../../../config/citationLookupConfiguration.js";
import type { ProjectSourceReader } from "../../../latex/includes/walkIncludedFiles.js";
import { requireArgument, type ToolOperation } from "../../actions/toolOperations.js";
import { projectArgument } from "../../projectArgument.js";
import { type ToolContext, textResult, truncateForModel } from "../../toolContext.js";
import { type ChosenRootDocument, mainTexFileArgument } from "../chooseRootDocument.js";
import { CITATION_LOOKUP_BUDGET_MS, startCitationLookupDeadline } from "./citationLookupDeadline.js";
import { findCitationEntries, readProjectBibliography } from "./findCitationEntries.js";
import { DEFAULT_MAXIMUM_ENTRIES, verifyCitedEntries } from "./verifyCitedEntries.js";

/**
 * look_up_citations in both of its versions: the same arguments and the same lookups, reading
 * the project either from the clone or from Overleaf's editor. The project is read first and
 * released before any lookup, so a slow catalogue holds neither the clone's lock nor an editor
 * session open.
 */

const CITATION_ACTIONS = ["verify", "find"] as const;

export const lookUpCitationsInput = z.object({
  project: projectArgument,
  action: z
    .enum(CITATION_ACTIONS)
    .default("verify")
    .describe(
      'What to do (default "verify"): verify checks the entries a document cites against public catalogues; find turns DOIs, arXiv ids or words from a title into BibTeX entries.',
    ),
  mainTexFile: mainTexFileArgument.describe(
    "verify only: root document whose citations to look up, as a path in the project, e.g. main.tex. Omit for the main document.",
  ),
  keys: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .optional()
    .describe(
      "verify only: citation keys to look up, cited or not. Omit to look up the cited entries in citation order.",
    ),
  maximumEntries: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(
      `verify only: look up at most this many entries, between 1 and 100 (default ${DEFAULT_MAXIMUM_ENTRIES}); the reply says how many were left.`,
    ),
  queries: z
    .array(z.string())
    .min(1)
    .max(MAXIMUM_CITATION_QUERIES)
    .optional()
    .describe(
      `find, required: 1 to ${MAXIMUM_CITATION_QUERIES} works to find, each a DOI, an arXiv id, or words from the title, optionally with an author and a year.`,
    ),
});

export type LookUpCitationsInput = z.infer<typeof lookUpCitationsInput>;

/** The project as the lookups read it: its files, and how to pick the root document. */
interface CitationProject {
  readonly reader: ProjectSourceReader;
  chooseRoot(requested: string | undefined): Promise<ChosenRootDocument>;
}

export type OpenCitationProject = <T>(
  project: string | undefined,
  read: (opened: CitationProject) => Promise<T>,
) => Promise<T>;

export function describeLookUpCitationsTool(whereTheProjectIsRead: string): string {
  return (
    "Look up bibliography entries in public catalogues; action picks what. " +
    "verify, the default, looks up the entries a document cites, or the keys given, to catch references that point at the wrong work or at nothing, such as a mistyped DOI or a citation made up by a model. " +
    "An entry with a DOI is resolved through doi.org (Crossref, DataCite and mEDRA DOIs), one with an arXiv id through arXiv's API, and any other through a Crossref title search; the registered title must match the entry's. " +
    "verify sends each looked-up entry's DOI, arXiv id, or title, first author and year to those services, and nothing else from the project. " +
    "It returns a verdict line, then entries whose DOI or arXiv id does not resolve or names a different title, then entries no search could confirm, which is weaker evidence because books, theses and web pages are often not in Crossref, then the confirmed ones. " +
    "check_references finds cited keys with no entry at all; verify checks the entries that exist. " +
    `find turns each query into a BibTeX entry: a DOI through doi.org, an arXiv id through arXiv, and words through a Crossref search that offers up to ${CROSSREF_CANDIDATE_COUNT} matches to choose from. ` +
    "find sends the queries as given and nothing from the project. Its keys avoid every key in the project's .bib files, and a work the bibliography already holds is named with its key. " +
    "find writes nothing; add the entries chosen with edit_file. " +
    `arXiv allows one request every three seconds, so arXiv lookups are slow, and a call stops starting lookups after ${CITATION_LOOKUP_BUDGET_MS / 1000} seconds and names what it did not reach. ` +
    whereTheProjectIsRead
  );
}

function citationEndpoints(context: ToolContext): CitationLookupEndpoints {
  return context.configuration.citationLookup ?? DEFAULT_CITATION_LOOKUP_ENDPOINTS;
}

export function lookUpCitationsOperations(
  context: ToolContext,
  openProject: OpenCitationProject,
): Record<(typeof CITATION_ACTIONS)[number], ToolOperation<LookUpCitationsInput>> {
  return {
    verify: {
      uses: ["mainTexFile", "keys", "maximumEntries"],
      run: async (input) => {
        const deadline = startCitationLookupDeadline();
        const { rootPath, bibliography } = await openProject(
          input.project,
          async ({ reader, chooseRoot }) => {
            const root = await chooseRoot(input.mainTexFile);
            return { rootPath: root.path, bibliography: await collectCitedRecords(reader, root.path) };
          },
        );
        const reply = await verifyCitedEntries({
          bibliography,
          rootPath,
          keys: input.keys,
          maximumEntries: input.maximumEntries ?? DEFAULT_MAXIMUM_ENTRIES,
          endpoints: citationEndpoints(context),
          deadline,
        });
        return textResult(truncateForModel(reply));
      },
    },
    find: {
      uses: ["queries"],
      run: async (input) => {
        const queries = requireArgument(input.queries, "queries", "find");
        const deadline = startCitationLookupDeadline();
        const bibliography = await openProject(input.project, ({ reader }) =>
          readProjectBibliography(reader),
        );
        const reply = await findCitationEntries(bibliography, queries, citationEndpoints(context), deadline);
        return textResult(truncateForModel(reply));
      },
    },
  };
}
