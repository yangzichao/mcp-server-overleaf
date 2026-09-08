# Security

## Supported versions

Security fixes target the latest published release. Upgrade to the latest patch after
reviewing the changelog. Before the first publication, fixes are made on `main`.

## Reporting a vulnerability

Do not post tokens, paper contents, or an exploitable vulnerability in a public issue.
Use the repository's **Security → Report a vulnerability** page when private reporting
is enabled. If it is unavailable, open an issue asking for a private contact without
including vulnerability details. Maintainers must enable private vulnerability reporting
as part of the first-release setup in [the release guide](docs/releasing.md).

## Trust boundaries

- The server runs with the permissions of the operating-system account that starts it.
  MCP clients can read project contents and request edits; use client approval controls
  for writes and review `show_diff` before authorizing `push_changes`.
- Keep the Overleaf token in a private file or the client's protected environment. Do not
  include it in command-line arguments, bug reports, screenshots, or source control.
- HTTP requires a bearer token and binds to loopback by default. Use a trusted tunnel or
  TLS termination for remote access; a bearer token sent over plain HTTP is not encrypted.
- The package installs without lifecycle scripts. Dependency versions are locked in
  `npm-shrinkwrap.json`; release verification installs and tests that actual package.
- LaTeX compilation invokes locally installed tools. Only compile projects you trust;
  this server is not an operating-system sandbox for hostile TeX projects.

Provenance establishes which source and workflow produced a package. It does not prove
that the code has no vulnerabilities or that an external Overleaf service is available.
