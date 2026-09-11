# Connect Local MCP Clients to Overleaf

Most of this is done for you by `npx --yes mcp-server-overleaf@0.3.3 setup`, which verifies
the token, writes the per-user configuration, and registers the server with Codex, Claude
Code, Claude Desktop and Cursor. Read on when you want to do it by hand, when your client is
not one of those, or when a registration needs checking.

For the manual npm/npx installation, start with
[Install from npm by hand](../README.md#install-from-npm-by-hand).
Use `npx --yes mcp-server-overleaf@0.3.3 --stdio` and set `OVERLEAF_MCP_ENV_FILE` to an
absolute external configuration path. The commands below document the source checkout
installation; its absolute `node dist/index.js` entry point remains supported.

This guide connects `mcp-server-overleaf` directly to MCP clients running on the same
computer. It covers Codex desktop and CLI, Claude Code, Claude Desktop, Cursor, and Visual
Studio Code.

Use this local setup when the client can start a process on the machine that holds this
repository. For ChatGPT on the web or a workspace-shared ChatGPT app, follow the separate
[Secure MCP Tunnel guide](connect-chatgpt-with-secure-mcp-tunnel.md).

## Choose the connection type

| Client | Recommended transport | Who starts the server |
| --- | --- | --- |
| Codex desktop, CLI, or IDE extension | stdio | Codex |
| Claude Code | stdio | Claude Code |
| Claude Desktop | stdio local developer server | Claude Desktop |
| Cursor | stdio | Cursor |
| Visual Studio Code | stdio | VS Code |
| ChatGPT web or a shared ChatGPT workspace app | Secure MCP Tunnel | `tunnel-client` |
| A client on another machine | Streamable HTTP over a protected network | You or a service manager |

Stdio is the best default for a single-user local installation. The client owns the child
process lifecycle, no TCP port is exposed, and this server loads its Overleaf credentials
from its own `.env` file.

## 1. Prepare the server once

Complete steps 1–3 in the main [README](../README.md): install dependencies, build the
server, create `.env`, and verify the Overleaf Git token with `git ls-remote`.

From the repository root, confirm the build and collect absolute paths:

```bash
npm install
npm run build

pwd -P
command -v node
test -f "$(pwd -P)/dist/index.js"
```

Record the output of `pwd -P` and `command -v node`. Replace the two placeholders below in
every client configuration:

- `/absolute/path/to/node`
- `/absolute/path/to/mcp-server-overleaf`

Use absolute paths even if `node` works in your terminal. Desktop applications often start
with a smaller `PATH` than an interactive shell.

Run a local smoke test:

```bash
/absolute/path/to/node \
  /absolute/path/to/mcp-server-overleaf/dist/index.js \
  --stdio
```

The process should remain running and print
`mcp-server-overleaf: listening on stdio` to stderr. Stop it with
<kbd>Ctrl</kbd>+<kbd>C</kbd>. Do not add `echo`, debug output, or other stdout-producing
commands to a stdio launcher; stdout carries the MCP protocol.

The server resolves `.env` from its installation directory, so the client configuration
does not need the Overleaf token. Keep `.env` at mode `600` and out of source control.

## 2. Codex desktop, CLI, and IDE extension

Codex clients on the same host share the MCP configuration in `~/.codex/config.toml`.
The CLI is the least error-prone way to add the server:

```bash
codex mcp add mcp-server-overleaf -- \
  /absolute/path/to/node \
  /absolute/path/to/mcp-server-overleaf/dist/index.js \
  --stdio

codex mcp get mcp-server-overleaf
codex mcp list
```

Restart the desktop app or IDE extension after adding the server. In the Codex terminal UI,
use `/mcp` to inspect active servers.

For manual configuration, add this table to `~/.codex/config.toml`:

```toml
[mcp_servers.mcp-server-overleaf]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/mcp-server-overleaf/dist/index.js", "--stdio"]
cwd = "/absolute/path/to/mcp-server-overleaf"
default_tools_approval_mode = "writes"
startup_timeout_sec = 15
tool_timeout_sec = 120
```

`default_tools_approval_mode = "writes"` lets read-only tools run without a prompt while
requiring approval for tools classified as writes. Keep the client’s normal review prompts
enabled for `push_changes` and `discard_local_changes`.

You can also configure the server through the desktop or IDE MCP settings:

1. Open **Settings → MCP servers**.
2. Choose **Add server** and select **STDIO**.
3. Enter the absolute Node command and the two arguments from the configuration above.
4. Save, restart the client, and confirm that 16 tools are available. It is 19 if you also
   set `OVERLEAF_SESSION_COOKIE`, which turns on the
   [tracked-changes tools](tracked-changes.md).

Reference: [Codex MCP documentation](https://developers.openai.com/codex/mcp).

## 3. Claude Code

Add the server at user scope to make it available across local projects:

```bash
claude mcp add \
  --transport stdio \
  --scope user \
  mcp-server-overleaf \
  -- \
  /absolute/path/to/node \
  /absolute/path/to/mcp-server-overleaf/dist/index.js \
  --stdio
```

The `--` separator is significant: everything after it is the stdio server command rather
than a Claude CLI option.

Verify both the saved configuration and connection state:

```bash
claude mcp get mcp-server-overleaf
claude mcp list
```

`claude mcp list` should show `✔ Connected`. Inside Claude Code, use `/mcp` to inspect or
enable the server.

Claude Code supports three useful scopes:

| Scope | Storage and visibility | When to use it |
| --- | --- | --- |
| `local` | Private to the current project; the default | One checkout only |
| `user` | Private user configuration across projects | Recommended for this absolute-path installation |
| `project` | A repository `.mcp.json` that can be committed | Teams with a portable launcher and agreed trust policy |

Do not commit an Overleaf token in `.mcp.json`. This server already reads the token from its
local `.env`.

Reference: [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp).

## 4. Claude Desktop

Anthropic recommends Desktop Extensions (`.dxt`) for packaged distribution. This repository
is a local developer server rather than a packaged extension, so manual stdio configuration
is appropriate for development.

Run Claude Desktop once, then fully quit it. Open its configuration file:

| Operating system | Configuration file |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Merge this entry into the existing `mcpServers` object rather than replacing other servers:

```json
{
  "mcpServers": {
    "mcp-server-overleaf": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/mcp-server-overleaf/dist/index.js",
        "--stdio"
      ]
    }
  }
}
```

Fully reopen Claude Desktop and inspect the available tools. On managed Team or Enterprise
devices, an administrator may need to allow local developer MCP servers.

On macOS, Claude Desktop writes connection logs under `~/Library/Logs/Claude`. The
`mcp-server-mcp-server-overleaf.log` file contains this server’s stderr, while `mcp.log`
contains client connection events.

Reference: [Anthropic's local MCP server guide](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

## 5. Cursor

Choose one Cursor configuration location:

| Scope | Configuration file |
| --- | --- |
| Global | `~/.cursor/mcp.json` |
| Project | `.cursor/mcp.json` in the project using the tools |

Add:

```json
{
  "mcpServers": {
    "mcp-server-overleaf": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/mcp-server-overleaf/dist/index.js",
        "--stdio"
      ]
    }
  }
}
```

Open Cursor’s MCP settings, enable the server, and verify that its 16 tools appear under
Available Tools. Cursor asks before tool calls by default; review mutating calls carefully.

Reference: [Cursor MCP documentation](https://docs.cursor.com/context/model-context-protocol).

## 6. Visual Studio Code

VS Code uses a different top-level JSON key from Claude and Cursor. Run **MCP: Add Server**
or create `.vscode/mcp.json` with:

```json
{
  "servers": {
    "mcp-server-overleaf": {
      "type": "stdio",
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/mcp-server-overleaf/dist/index.js",
        "--stdio"
      ]
    }
  }
}
```

Run **MCP: List Servers** to start, stop, restart, or inspect the server. Confirm the trust
prompt before starting a newly added local server.

Reference: [VS Code MCP server documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

## 7. Verify every client with read-only calls

Adding configuration proves only that the client saved it. Use the client to call the
server before reporting the setup as complete.

Start with:

> Use the Overleaf MCP server's `list_projects` tool only. Do not edit, compile, discard,
> synchronize, or push anything. Show the configured project names and identify the default.

Then call `list_files` for one project. A successful file listing verifies the client,
stdio process, `.env`, Overleaf Git token, local clone, and remote project access.

Before publishing an edit:

1. Make a narrow edit with `replace_text` or `edit_section`.
2. Inspect the unpublished change with `show_diff`.
3. Run `compile_project` when a TeX distribution is available.
4. Call `push_changes` only after the user approves publication and provides a meaningful
   commit message.

`discard_local_changes` deletes unpublished local edits and commits. Treat it as a
destructive operation.

## Optional: local Streamable HTTP

Use stdio unless a local client specifically needs an HTTP URL. To start the protected HTTP
transport, add a strong bearer token to `.env`:

```dotenv
OVERLEAF_MCP_HTTP_AUTH_TOKEN=replace_with_a_long_random_value
```

Then run:

```bash
/absolute/path/to/node \
  /absolute/path/to/mcp-server-overleaf/dist/index.js \
  --http \
  --port 3017
```

The MCP URL is `http://127.0.0.1:3017/`. Configure the client to read the bearer token from
an environment variable or secure credential store. Do not put the token directly in a
committed JSON or TOML file.

The server binds to loopback by default and refuses to start without
`OVERLEAF_MCP_HTTP_AUTH_TOKEN`. Do not use `--allow-anonymous` for a listener reachable by
other users or machines.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `node` or the server file is not found | Use absolute paths for both the Node executable and `dist/index.js`; rebuild with `npm run build`. |
| The client connects in a terminal but not in a desktop app | The GUI has a different `PATH`; use the absolute result of `command -v node` and fully restart the app. |
| The server exits immediately | Run the exact command manually and inspect stderr. Check `.env`, the project ID, and the Overleaf token. |
| JSON parse error | Merge the entry into the existing object and validate commas, braces, and the client-specific top-level key. |
| The server appears but exposes no tools | Restart the client, inspect its MCP logs, and ensure no launcher writes ordinary text to stdout. |
| `list_projects` works but `list_files` fails | Re-run `git ls-remote`; check Git integration, project access, network access to Overleaf, and the clone directory. |
| A second client waits on the same project | Let the first call finish. The server serializes project operations across processes to protect the local clone. |
| A write exists locally but is absent from Overleaf | This is expected until `push_changes` succeeds; inspect it with `show_diff`. |

## Updating or removing the connection

Re-run `npm run build` after pulling a new server version, then restart the MCP client so it
spawns the new `dist/index.js`.

CLI removal commands:

```bash
codex mcp remove mcp-server-overleaf
claude mcp remove --scope user mcp-server-overleaf
```

For Claude Desktop, Cursor, or VS Code, remove only the `mcp-server-overleaf` entry from the
relevant JSON object and restart the client. Removing a client entry does not delete `.env`,
the local Overleaf clones, or anything in Overleaf.
