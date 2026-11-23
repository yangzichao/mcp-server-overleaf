import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * doi.org, Crossref and arXiv as look_up_citations calls them, on one local port. Each answers
 * in its documented form: CSL JSON, BibTeX or 404 for a DOI, Crossref's `message.items` for a
 * search, and an Atom feed for an arXiv id.
 */

export interface RecordedMetadataRequest {
  readonly path: string;
  readonly query: URLSearchParams;
  readonly accept: string | undefined;
  readonly userAgent: string | undefined;
}

export interface FakeWork {
  readonly title: string;
  readonly subtitle?: string;
}

/** The parts of an arXiv API entry a citation is built from; all but the title are optional. */
export interface FakeArxivPaper extends FakeWork {
  readonly authors?: readonly string[];
  /** As `2017-06-12T17:57:34Z`. */
  readonly published?: string;
  readonly primaryCategory?: string;
  readonly doi?: string;
  readonly journalReference?: string;
  /** The latest version, named in the entry's `<id>`; 1 when left out. */
  readonly latestVersion?: number;
}

/** A Crossref `/works` item, with the fields a search answer may carry. */
export interface FakeCrossrefWork {
  readonly DOI: string;
  readonly title: string[];
  readonly type?: string;
  readonly subtitle?: string[];
  readonly author?: Array<{ family?: string; given?: string; name?: string; suffix?: string }>;
  readonly editor?: Array<{ family?: string; given?: string; name?: string }>;
  readonly "container-title"?: string[];
  readonly volume?: string;
  readonly issue?: string;
  readonly page?: string;
  readonly "article-number"?: string;
  readonly issued?: { "date-parts": number[][] };
  readonly published?: { "date-parts": number[][] };
  readonly publisher?: string;
  readonly "publisher-location"?: string;
  readonly ISBN?: string[];
}

const CSL_JSON = "application/vnd.citationstyles.csl+json";
const BIBTEX = "application/x-bibtex";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function arxivEntry(arxivId: string, paper: FakeArxivPaper): string {
  const optional = [
    paper.published === undefined ? "" : `<published>${paper.published}</published>`,
    ...(paper.authors ?? []).map((name) => `<author><name>${escapeXml(name)}</name></author>`),
    paper.doi === undefined ? "" : `<arxiv:doi>${escapeXml(paper.doi)}</arxiv:doi>`,
    paper.journalReference === undefined
      ? ""
      : `<arxiv:journal_ref>${escapeXml(paper.journalReference)}</arxiv:journal_ref>`,
    paper.primaryCategory === undefined
      ? ""
      : `<arxiv:primary_category term="${paper.primaryCategory}" scheme="http://arxiv.org/schemas/atom"/>`,
  ];
  return [
    `<entry><id>http://arxiv.org/abs/${arxivId}v${paper.latestVersion ?? 1}</id>`,
    `<title>${escapeXml(paper.title)}</title>`,
    ...optional,
    "</entry>",
  ].join("");
}

export class FakeMetadataServices {
  readonly requests: RecordedMetadataRequest[] = [];
  /** Registered DOIs, answered in CSL JSON; any DOI in neither map answers 404. */
  readonly dois = new Map<string, FakeWork>();
  /** What doi.org sends for a DOI asked for as BibTeX, exactly as given. */
  readonly doiBibtex = new Map<string, string>();
  readonly arxivPapers = new Map<string, FakeArxivPaper>();
  /** What every Crossref search returns, best first. */
  searchResults: FakeCrossrefWork[] = [];
  /** How many of the next requests, to any service, are refused with 429 as a busy Crossref does. */
  tooManyRequestsAhead = 0;

  private constructor(
    private readonly server: Server,
    private readonly baseUrl: string,
  ) {}

  static async start(): Promise<FakeMetadataServices> {
    let services: FakeMetadataServices | undefined;
    const server = createServer((request, response) => services?.handle(request, response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    services = new FakeMetadataServices(server, `http://127.0.0.1:${port}`);
    return services;
  }

  environment(): Record<string, string> {
    return {
      OVERLEAF_MCP_DOI_RESOLVER_URL: `${this.baseUrl}/doi`,
      OVERLEAF_MCP_CROSSREF_API_URL: `${this.baseUrl}/crossref`,
      OVERLEAF_MCP_ARXIV_API_URL: `${this.baseUrl}/arxiv`,
    };
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? "/", this.baseUrl);
    this.requests.push({
      path: url.pathname,
      query: url.searchParams,
      accept: request.headers.accept,
      userAgent: request.headers["user-agent"],
    });
    if (this.tooManyRequestsAhead > 0) {
      this.tooManyRequestsAhead -= 1;
      response.writeHead(429).end();
      return;
    }

    if (url.pathname.startsWith("/doi/")) {
      this.answerDoi(
        decodeURIComponent(url.pathname.slice("/doi/".length)),
        request.headers.accept,
        response,
      );
      return;
    }
    if (url.pathname === "/crossref/works") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", message: { items: this.searchResults } }));
      return;
    }
    if (url.pathname === "/arxiv/query") {
      const arxivId = url.searchParams.get("id_list") ?? "";
      const paper = this.arxivPapers.get(arxivId);
      const entry = paper ? arxivEntry(arxivId.replace(/v\d+$/, ""), paper) : "";
      response.writeHead(200, { "content-type": "application/atom+xml" });
      response.end(
        `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><title>ArXiv Query</title>${entry}</feed>`,
      );
      return;
    }
    response.writeHead(404).end();
  }

  /** 406 for a registered DOI asked for in a form it is not registered in, as doi.org answers. */
  private answerDoi(doi: string, accept: string | undefined, response: ServerResponse): void {
    const work = this.dois.get(doi);
    const bibtex = this.doiBibtex.get(doi);
    if (accept === CSL_JSON && work) {
      response.writeHead(200, { "content-type": CSL_JSON });
      response.end(JSON.stringify({ type: "article-journal", ...work }));
      return;
    }
    if (accept === BIBTEX && bibtex !== undefined) {
      response.writeHead(200, { "content-type": `${BIBTEX}; charset=utf-8` });
      response.end(bibtex);
      return;
    }
    response.writeHead(work || bibtex !== undefined ? 406 : 404).end();
  }
}
