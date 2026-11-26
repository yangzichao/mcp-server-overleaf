# Overleaf MCP for Claude Code

Read, edit, and compile Overleaf LaTeX projects from Claude Code. This independent
community plugin runs a local MCP server and includes five skills for collaboration,
LaTeX checks, diffs and flattening, figures and PDFs, and arXiv preparation.

When you edit through Overleaf's Git integration, your edits stay in a local clone until
you confirm a push. The server stops the push when your edits conflict with a co-author's
changes. With a session cookie, tracked-change suggestions and comment replies go directly
to Overleaf. In cookie-only mode, ordinary edits also go directly to the Overleaf editor.

## Set up an Overleaf project

Install Node.js 22.14 or later and have Git on your PATH. You can install the plugin
from this repository's marketplace with Claude Code 2.1.275 or later.

```text
/plugin install overleaf --marketplace yangzichao/mcp-server-overleaf
```

For a project with Overleaf Git integration, run the following command in a terminal
and enter the project URL and your Overleaf Git token when prompted.

```bash
npx --yes mcp-server-overleaf@0.6.2 setup --clients none
```

For a project without Git integration, follow the
[session-cookie setup guide](https://github.com/yangzichao/mcp-server-overleaf/blob/main/docs/tracked-changes.md#without-git-integration).
Once configured, restart Claude Code and run `/mcp` to check the connection.

Local compilation requires `latexmk` and a TeX distribution. A session cookie also lets
you compile on Overleaf.

## What data the server uses

The server keeps project clones and credential files on your computer. It sends
credentials only to the configured Overleaf hosts and returns requested project content
to Claude Code. Citation lookups send bibliography metadata or your search query to
doi.org, Crossref, or arXiv. The server has no telemetry.
[Privacy policy](https://github.com/yangzichao/mcp-server-overleaf/blob/main/docs/privacy-policy.md)

## Project listings and usage

The server is listed in Awesome MCP Servers. Glama grades its tool definitions A.
npm recorded 1,007 downloads from November 17 to 23, 2026.
[Awesome MCP Servers Research listing](https://github.com/punkpeye/awesome-mcp-servers/blob/35d10d26a94b49f539fd8a18b81de83087ec74e4/README.md#L4079) ·
[Glama rating](https://glama.ai/mcp/servers/yangzichao/mcp-server-overleaf/badges/score.svg) ·
[npm download count](https://api.npmjs.org/downloads/point/2026-11-17:2026-11-23/mcp-server-overleaf)
