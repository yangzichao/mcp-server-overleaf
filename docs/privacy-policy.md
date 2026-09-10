# Privacy Policy

**mcp-server-overleaf** — last updated 10 September 2026.

This server runs on your own computer. There is no service behind it, no account to create,
and no operator who can see your data. The statements below describe what the code does; the
code is MIT licensed and readable at
[github.com/yangzichao/mcp-server-overleaf](https://github.com/yangzichao/mcp-server-overleaf).

## What it collects

Nothing is collected by the author or by any third party the author controls. The server has
no analytics, no telemetry, no crash reporting, and no usage counters.

It handles two things you give it:

- **Your Overleaf Git authentication token**, used only to authenticate to the Overleaf Git
  bridge.
- **Your Overleaf project content**, cloned so it can be read, edited, and compiled locally.

## Where that data goes

| Data | Where it is stored | Where it is sent |
| --- | --- | --- |
| Overleaf Git token | The Claude Desktop extension keeps it in the operating system keychain and passes it to the server as an environment variable. The `setup` command instead writes it to `overleaf-mcp/projects.json` in your user configuration directory, at file mode `600`. | Only to the Overleaf Git host, as a Git credential. It is never written to stdout, and it is redacted from error messages. |
| Project files | A clone under `~/.overleaf-mcp/projects`, or the directory you set with `OVERLEAF_MCP_WORKSPACE_DIR`. | To Overleaf when you approve `push_changes`. To the MCP client that started the server, whenever a tool returns file content. |
| Compile output | The same clone directory. | To the MCP client, as the compile report. |

The server opens no other network connections. Its only outbound traffic is Git over HTTPS
to `https://git.overleaf.com`, or to the host you set with `OVERLEAF_GIT_BASE_URL`. The one
exception is the `setup` command, which may run `npm install` against the npm registry to
place a stable copy of the server outside the disposable `npx` cache.

## Sharing with third parties

The author shares nothing, because the author receives nothing.

Two third parties see data as a direct consequence of using the server, and you choose both:

- **Overleaf** receives the Git operations you ask for, under
  [Overleaf's own privacy policy](https://www.overleaf.com/legal#Privacy).
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
