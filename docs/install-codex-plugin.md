# Install the Codex Plugin

Codex installs this server as a plugin, which is one command instead of a hand-written
`~/.codex/config.toml` entry. This guide covers what the plugin contains, how to install and
remove it, how it gets your Overleaf token without holding one, and how to build it.

For the manual `codex mcp add` route and for every other client, see
[Connect local MCP clients to Overleaf](connect-local-mcp-clients.md).

## Install

```bash
npx --yes mcp-server-overleaf@0.3.1 setup --clients none
codex plugin marketplace add yangzichao/mcp-server-overleaf
codex plugin add overleaf@mcp-server-overleaf
```

Restart Codex, then ask it to list the files in your project.

The first command asks for the project address and a Git token, proves the token reaches
Overleaf, and writes `~/.config/overleaf-mcp/projects.json` at mode 600. `--clients none`
tells it to write only that file and register nothing, because the next two commands do the
registering. Run it without `--clients none` if you also use Claude Code, Claude Desktop or
Cursor.

Check the result:

```bash
codex plugin list
codex mcp list
```

`codex plugin list` should show `overleaf@mcp-server-overleaf` as installed and enabled, and
`codex mcp list` should show an `overleaf` server running `npx --yes mcp-server-overleaf --stdio`.

## Why a marketplace, and why this repository

Codex has no central plugin directory to submit to. `codex plugin marketplace add` takes a
Git repository, a local path, or an HTTPS or SSH Git URL, and reads
`.agents/plugins/marketplace.json` out of it. So this repository is its own marketplace: the
manifest lists one plugin, `overleaf`, and points at `plugins/overleaf`.

That is the whole distribution mechanism. Nothing is submitted anywhere, nothing is
approved, and the version you install is the one on the Git ref you added.

## What the plugin contains

```
.agents/plugins/marketplace.json     the catalogue Codex reads out of this repository
plugins/overleaf/
  .codex-plugin/plugin.json          name, version, and how Codex presents the plugin
  .mcp.json                          the one MCP server, and how to launch it
  assets/icon.png                    the same icon the Claude Desktop bundle uses
```

`.mcp.json` is four lines of substance:

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "npx",
      "args": ["--yes", "mcp-server-overleaf@0.3.1", "--stdio"]
    }
  }
}
```

No `env` block, and no token. That is deliberate: the plugin is a public file in a public
repository, so it must not be able to carry a credential even by accident.
`tests/codex/renderCodexPlugin.test.ts` asserts the committed file declares no environment
variables at all.

The server finds `~/.config/overleaf-mcp/projects.json` on its own, which is why the plugin
does not have to pass anything in. Start the server without that file and without any
`OVERLEAF_*` variable and it exits with a configuration error rather than starting empty.

The version is pinned rather than floating. A plugin installed from an older Git ref keeps
launching the server that ref was tested against.

## Update

```bash
codex plugin marketplace upgrade mcp-server-overleaf
codex plugin add overleaf@mcp-server-overleaf
```

The first command refreshes the repository snapshot Codex keeps; the second reinstalls the
plugin at the version that snapshot now names.

## Remove

```bash
codex plugin remove overleaf@mcp-server-overleaf
codex plugin marketplace remove mcp-server-overleaf
```

Neither command touches `~/.config/overleaf-mcp/projects.json`, the local clones under
`~/.overleaf-mcp/projects`, or anything in Overleaf. Delete the configuration file yourself
if you want the token gone.

## Build it

```bash
npm run codex:build
```

`scripts/codex/writeCodexPluginFiles.mjs` rewrites the three JSON files and the icon from
`package.json`, so the plugin version and the npm version cannot disagree. The files are
committed rather than built into `build/`, because Codex clones this repository and reads
them where they lie.

`npm run check` fails if the committed files drift from what the renderer produces, so a
forgotten `npm run codex:build` after a version bump is caught before release.

To try a change before pushing it, add the working tree as a local marketplace:

```bash
codex plugin marketplace add "$(pwd -P)"
codex plugin add overleaf@mcp-server-overleaf
```

OpenAI ships a validator for the manifest contract in the `openai/codex` repository at
`codex-rs/skills/src/assets/samples/plugin-creator/scripts/validate_plugin.py`. Run it
against `plugins/overleaf` after changing the manifest.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `codex plugin add` cannot find the plugin | Run `codex plugin marketplace list` and confirm `mcp-server-overleaf` is there with this repository as its root. |
| The plugin installs but no server appears | Restart Codex, then run `codex mcp list`. A plugin's servers are read at startup. |
| The server exits immediately | Run `npx --yes mcp-server-overleaf --stdio` in a terminal and read stderr. Usually `projects.json` is missing because setup has not been run. |
| `npx` is not found | Codex started with a smaller `PATH` than your terminal. Install Node system-wide, or use `npx --yes mcp-server-overleaf setup` to register an absolute Node path instead of the plugin. |
| The plugin installs an old server version | `codex plugin marketplace upgrade mcp-server-overleaf`, then `codex plugin add` again. |
