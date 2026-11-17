# Privacy Policy

**mcp-server-overleaf** — last updated 17 November 2026.

This server runs on your own computer. There is no service behind it, no account to create,
and no operator who can see your data. The statements below describe what the code does; the
code is MIT licensed and readable at
[github.com/yangzichao/mcp-server-overleaf](https://github.com/yangzichao/mcp-server-overleaf).

## What it collects

Nothing is collected by the author or by any third party the author controls. The server has
no analytics, no telemetry, no crash reporting, and no usage counters.

It handles what you give it:

- **Your Overleaf Git authentication token**, used only to authenticate to the Overleaf Git
  bridge.
- **Your Overleaf session cookie**, only if you configure one, used only to authenticate to
  Overleaf's web application and real-time editor service.
- **Your Overleaf project content**, cloned so it can be read, edited, and compiled locally.

## Where that data goes

| Data | Where it is stored | Where it is sent |
| --- | --- | --- |
| Overleaf Git token | The Claude Desktop extension keeps it in the operating system keychain and passes it to the server as an environment variable. The `setup` command instead writes it to `overleaf-mcp/projects.json` in your user configuration directory, at file mode `600`. | Only to the Overleaf Git host, as a Git credential. It is never written to stdout, and it is redacted from error messages. |
| Project files | A clone under `~/.overleaf-mcp/projects`, or the directory you set with `OVERLEAF_MCP_WORKSPACE_DIR`. | To Overleaf when you approve `push_changes`. To the MCP client that started the server, whenever a tool returns file content. |
| Overleaf session cookie | Wherever you put it: `OVERLEAF_SESSION_COOKIE`, or the file `OVERLEAF_SESSION_COOKIE_FILE` names. | Only to Overleaf's web host, `https://www.overleaf.com` or the one you set with `OVERLEAF_WEB_BASE_URL`. Compiled output is fetched from that same host, never from Overleaf's separate PDF domain. It is redacted from error messages. |
| Compile output | The same clone directory, or for `compile_on_overleaf` a path you pass. | To the MCP client, as the compile report. |
| Bibliography entries you ask `verify_citations` to check | Nowhere new. | Each entry's title, DOI, arXiv id, first author's family name and year, to `https://doi.org`, `https://api.crossref.org` and `http://export.arxiv.org`, or the hosts you set with `OVERLEAF_MCP_DOI_RESOLVER_URL`, `OVERLEAF_MCP_CROSSREF_API_URL` and `OVERLEAF_MCP_ARXIV_API_URL`. No cookie, token, e-mail address or other file content is sent. |

The server opens no other network connections. It sends Git over HTTPS to
`https://git.overleaf.com`, or to the host you set with `OVERLEAF_GIT_BASE_URL`. With a
session cookie configured, the review and web tools also talk to Overleaf's web host. Only
`verify_citations` contacts a service other than Overleaf, and only when it is called. The
`setup` command may also run `npm install` against the npm registry to place a stable copy of
the server outside the disposable `npx` cache.

## Sharing with third parties

The author shares nothing, because the author receives nothing.

These third parties see data as a direct consequence of using the server, and you choose
each of them:

- **Overleaf** receives the Git operations you ask for, and the web and editor requests the
  session-cookie tools make, under
  [Overleaf's own privacy policy](https://www.overleaf.com/legal#Privacy).
- **doi.org, Crossref and arXiv** receive the bibliography metadata listed above when
  `verify_citations` is called, and nothing at any other time.
- **The MCP client you connect** — Claude Desktop, Claude Code, Codex, Cursor, or another —
  receives whatever a tool returns, and handles it under that client's own policy. Content a
  tool returns becomes part of the conversation with that client's model provider.

## Retention

Everything lives on your computer until you delete it. Removing the extension does not delete
the clones; delete `~/.overleaf-mcp` to remove them, and revoke the token in your Overleaf
account settings under Git integration.

## Children

The server is a developer tool and is not directed at children under 13.

## Changes

Changes to this policy are committed to the repository, so the history of this file is the
complete record. Material changes are noted in
[CHANGELOG.md](https://github.com/yangzichao/mcp-server-overleaf/blob/main/CHANGELOG.md).

## Contact

Open an issue at
[github.com/yangzichao/mcp-server-overleaf/issues](https://github.com/yangzichao/mcp-server-overleaf/issues).
For anything you would rather not post publicly, follow
[SECURITY.md](https://github.com/yangzichao/mcp-server-overleaf/blob/main/SECURITY.md).
