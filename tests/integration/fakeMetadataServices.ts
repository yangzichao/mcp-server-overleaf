import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * doi.org, Crossref and arXiv as verify_citations calls them, on one local port. Each answers
 * in its documented form: CSL JSON or 404 for a DOI, Crossref's `message.items` for a search,
 * and an Atom feed for an arXiv id.
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

export class FakeMetadataServices {
  readonly requests: RecordedMetadataRequest[] = [];
  /** Registered DOIs; any other answers 404. */
  readonly dois = new Map<string, FakeWork>();
  readonly arxivPapers = new Map<string, FakeWork>();
  /** What every Crossref search returns, best first. */
  searchResults: Array<{
    DOI: string;
    title: string[];
    author?: Array<{ family?: string; given?: string; name?: string }>;
    issued?: { "date-parts": number[][] };
  }> = [];

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

    if (url.pathname.startsWith("/doi/")) {
      const work = this.dois.get(decodeURIComponent(url.pathname.slice("/doi/".length)));
      if (!work || request.headers.accept !== "application/vnd.citationstyles.csl+json") {
        response.writeHead(work ? 406 : 404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/vnd.citationstyles.csl+json" });
      response.end(JSON.stringify({ type: "article-journal", ...work }));
      return;
    }
    if (url.pathname === "/crossref/works") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", message: { items: this.searchResults } }));
      return;
    }
    if (url.pathname === "/arxiv/query") {
      const work = this.arxivPapers.get(url.searchParams.get("id_list") ?? "");
      const entry = work ? `<entry><id>x</id><title>${work.title}</title></entry>` : "";
      response.writeHead(200, { "content-type": "application/atom+xml" });
      response.end(`<?xml version="1.0"?><feed><title>ArXiv Query</title>${entry}</feed>`);
      return;
    }
    response.writeHead(404).end();
  }
}
