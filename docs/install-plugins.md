# Install the Claude Code and Codex Plugins

Claude Code and Codex both install this server as a plugin, which is one command instead of
a hand-written configuration entry. This guide covers what the plugin contains, how to
install and remove it in each client, how it gets your Overleaf token without holding one,
and how to build it.

For the manual `claude mcp add` and `codex mcp add` routes, and for every other client, see
[Connect local MCP clients to Overleaf](connect-local-mcp-clients.md).

## Install

Run this once first, in either case:

```bash
npx --yes mcp-server-overleaf@0.3.4 setup --clients none
```

It asks for the project address and a Git token, proves the token reaches Overleaf, and
writes `~/.config/overleaf-mcp/projects.json` at mode 600. `--clients none` tells it to write
only that file and register nothing, because the plugin does the registering. Drop that flag
if you also want Claude Desktop or Cursor configured directly.

### Claude Code

```bash
claude plugin marketplace add yangzichao/mcp-server-overleaf
claude plugin install overleaf@mcp-server-overleaf
```

`claude plugin details overleaf@mcp-server-overleaf` should report one MCP server. Inside
Claude Code, `/mcp` shows it connected.

### Codex

```bash
codex plugin marketplace add yangzichao/mcp-server-overleaf
codex plugin add overleaf@mcp-server-overleaf
```

Restart Codex, then `codex plugin list` should show the plugin installed and enabled, and
`codex mcp list` should show an `overleaf` server running
`npx --yes mcp-server-overleaf --stdio`.

## Why a marketplace, and why this repository

Neither client has a central plugin directory to submit to. In both, a marketplace is a Git
repository: `claude plugin marketplace add` reads `.claude-plugin/marketplace.json` out of
it, and `codex plugin marketplace add` reads `.agents/plugins/marketplace.json`. Both accept
`owner/repo`, a local path, or a Git URL.

So this repository is its own marketplace, twice over. That is the whole distribution
mechanism. Nothing is submitted anywhere, nothing is approved, and the version you install
is the one on the Git ref you added.

## What the plugin contains

```
.claude-plugin/marketplace.json          the catalogue Claude Code reads
.agents/plugins/marketplace.json         the catalogue Codex reads
plugins/overleaf/
  .mcp.json                              the one MCP server, shared by both clients
  .claude-plugin/plugin.json             name, version, description for Claude Code
  .codex-plugin/plugin.json              the same, plus how Codex presents the plugin
  assets/icon.png                        the same icon the Claude Desktop bundle uses
```

One plugin directory serves both clients, so they cannot drift apart. `.mcp.json` is four
lines of substance:

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "npx",
      "args": ["--yes", "mcp-server-overleaf@0.3.4", "--stdio"]
    }
  }
}
```

No `env` block, and no token. That is deliberate: the plugin is a public file in a public
repository, so it must not be able to carry a credential even by accident.
`tests/plugins/renderSharedMcpServers.test.ts` asserts the committed file declares nothing
but a command and its arguments.

The server finds `~/.config/overleaf-mcp/projects.json` on its own, which is why the plugin
does not have to pass anything in. Start the server without that file and without any
`OVERLEAF_*` variable and it exits with a configuration error rather than starting empty.

The version is pinned rather than floating. A plugin installed from an older Git ref keeps
launching the server that ref was tested against.

## Update

```bash
claude plugin marketplace update mcp-server-overleaf
claude plugin update overleaf@mcp-server-overleaf
```

```bash
codex plugin marketplace upgrade mcp-server-overleaf
codex plugin add overleaf@mcp-server-overleaf
```

The first command in each pair refreshes the repository snapshot the client keeps; the
second moves the installed plugin to the version that snapshot now names.

## Remove

```bash
claude plugin uninstall overleaf@mcp-server-overleaf
claude plugin marketplace remove mcp-server-overleaf
```

```bash
codex plugin remove overleaf@mcp-server-overleaf
codex plugin marketplace remove mcp-server-overleaf
```

None of these touch `~/.config/overleaf-mcp/projects.json`, the local clones under
`~/.overleaf-mcp/projects`, or anything in Overleaf. Delete the configuration file yourself
if you want the token gone.

## Build it

```bash
npm run plugins:build
```

`scripts/plugins/writePluginFiles.mjs` rewrites both marketplaces, both manifests, the shared
`.mcp.json`, and the icon from `package.json`, so the plugin version and the npm version
cannot disagree. The files are committed rather than built into `build/`, because both
clients clone this repository and read them where they lie.

`npm run check` fails if the committed files drift from what the renderers produce, so a
forgotten `npm run plugins:build` after a version bump is caught before release.

To try a change before pushing it, add the working tree as a local marketplace:

```bash
claude plugin marketplace add "$(pwd -P)"
codex plugin marketplace add "$(pwd -P)"
```

OpenAI ships a validator for the Codex manifest contract in the `openai/codex` repository at
`codex-rs/skills/src/assets/samples/plugin-creator/scripts/validate_plugin.py`. It also needs
`identifier_validation.py` from the same directory. Run it against `plugins/overleaf` after
changing that manifest.

Set `CLAUDE_CONFIG_DIR` or `CODEX_HOME` to a scratch directory while testing, so a trial
install does not touch your real configuration.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| The install command cannot find the plugin | List the configured marketplaces and confirm `mcp-server-overleaf` is there with this repository as its source. |
| The plugin installs but no server appears | Restart the client. A plugin's MCP servers are read at startup. |
| The server exits immediately | Run `npx --yes mcp-server-overleaf --stdio` in a terminal and read stderr. Usually `projects.json` is missing because setup has not been run. |
| `npx` is not found | The client started with a smaller `PATH` than your terminal. Install Node system-wide, or use `npx --yes mcp-server-overleaf setup` to register an absolute Node path instead of the plugin. |
| The plugin installs an old server version | Update the marketplace snapshot, then install again. |
