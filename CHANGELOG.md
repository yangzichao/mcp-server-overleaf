# Changelog

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
