# Changelog

## Unreleased

- Stop inheriting the user's global Git settings that break a commit. A `commit.gpgsign`
  or `core.hooksPath` in `~/.gitconfig` made `push_changes` fail to sign or be refused by
  someone else's hook; `http.proxy` and `url.*.insteadOf` are still inherited on purpose.
- Match `search_project` regular expressions on a worker thread under a deadline. A
  pattern that backtracks exponentially, such as `(a+)+`, previously blocked the whole
  server while holding the project lock. Truncating the line never bounded this.
- Treat a blank `OVERLEAF_MCP_HTTP_HOST` or `--host` as unset. Node reads an empty host as
  every interface, so the loopback default could silently become network-reachable.
- Expand a text-only checkout only for a file Git is tracking. A mistyped path or a
  newly created file turned sparse checkout off permanently for the whole project.

## 0.1.1

- Fix the release publisher so npm receives the verified archive as an explicit local path.

## 0.1.0

Initial release candidate:

- Sixteen tools for reading, searching, editing, reviewing, synchronizing, compiling,
  and explicitly publishing Overleaf projects through the Git bridge.
- Collaborator conflict protection, path and symlink containment, secret redaction,
  inter-process locks, and recovery after rejected pushes and restarts.
- Project JSON configuration and independent token files, extension filtering, and a structured project summary.
- Explicit-baseline incremental reads, bounded snapshots, and optional revision checks on every edit.
- Opt-in text-only sparse checkout, with safe expansion for reads, edits and compilation.
- Local stdio and authenticated Streamable HTTP transports.
- Precompiled npm command, an external configuration file for npx, and version reporting.
- Locked dependencies, repeatable package builds, installed-package integration tests,
  and a GitHub Actions publication workflow with provenance and registry verification.

Supported release validation: macOS and Linux; Node 22.14+, including 24 and 26.
TeX is optional except for `compile_project`. Overleaf Git integration is required.
