# Releasing to npm

This repository publishes a CLI application. The release gate covers repeatable builds,
locked runtime dependencies, real installed-package behavior, and a verifiable link from
npm back to the GitHub source and workflow. It does not establish an external security
audit, Windows support, or availability of the real Overleaf service.

## What is enforced in the repository

- `prepack` clears `dist`, compiles from source, and swaps in a runtime-only shrinkwrap that
  `postpack` swaps back. npm builds a dependency's tree from the lock inside the tarball, so a
  shipped development lock is a shipped toolchain. The package contains compiled JavaScript,
  that shrinkwrap, documentation, and the license; source, tests, CI, and local
  configuration are excluded by an allowlist checked against the actual archive.
- `npm run package:check` builds twice and compares the archives byte for byte. It installs
  the tarball into a temporary directory with spaces, without `--omit=dev`, and fails if the
  shrinkwrap inside that tarball still describes development dependencies. It disables
  install scripts, checks the npm command, and runs every integration suite against the
  installed entry point. npm resolves a local archive's dependencies itself rather than from
  the archive's shrinkwrap, so the tested tree is the newest resolution of the declared
  ranges; only a registry install is governed by the shipped lock.
- Installed-package tests cover both MCP transports, edits, collaborator conflicts,
  rejected pushes, restarts, concurrent clients, external and per-project configuration,
  revision reads and guarded edits, sparse checkout, and compilation after expansion.
- Source checks run on macOS and Linux with Node 22.14, 24, and 26. A Linux job requires TeX,
  tests compilation in the installed package, and produces the release candidate.
- Dependency audits block on any reported severity. npm and GitHub Actions updates are
  proposed by Dependabot. Action references are pinned to complete commit hashes.
- `release.yml` only proceeds on a matching stable `vX.Y.Z` tag whose commit is on `main`
  and whose version has a changelog entry. All checks run again on that tag.
- The publish job downloads the tested archive, checks its SHA-512 integrity, and publishes
  those exact bytes with lifecycle scripts disabled. It installs no project dependencies.
- Only the publish job has OIDC permission. It requests provenance; a separate job compares
  npm's integrity, requires attestations, verifies registry signatures and provenance with
  `npm audit signatures`, and runs the installed command.
- Each candidate includes a file manifest and a CycloneDX SBOM for its installed runtime
  dependency tree. Repeated builds are compared within one environment; this is not a
  claim of independently reproduced builds across different compilers or operating systems.

## Local preparation

Use Node 24 LTS for release work. The CI artifact producer uses npm 11.19.1.

```bash
npm ci
npm run check:release
actionlint
```

`release-artifacts/` contains the verified tarball, `package-manifest.json`, and
`sbom.cdx.json`. This directory is ignored by Git and rebuilt from nothing on every check,
so it holds one version at a time and a stale archive cannot be published or uploaded.
`npm-shrinkwrap.json` is the canonical lockfile; do not add a parallel `package-lock.json`.
If a pack fails, `npm-shrinkwrap.development.json` is left in the working tree and the next
pack or package check puts it back; commit `npm-shrinkwrap.json` only with its development
entries present.
Dependency upgrades must pass both the source and package checks.

Before tagging, update `package.json`, its shrinkwrap, `CHANGELOG.md`, and the pinned
installation examples. CLI and MCP version reporting read `package.json` directly.

## Required account and repository setup

These are server-side settings; committing workflow YAML does not enable them:

1. Use npm and GitHub accounts with 2FA. Confirm ownership of the npm package name.
2. Keep this source repository public for public provenance. Protect `main` and `v*` tags
   against unreviewed changes, force updates, and deletion. Require the Check jobs on PRs.
3. Create the GitHub environment `npm-production`, restrict deployment to version tags,
   and configure a required reviewer when a second maintainer is available. Review the
   exact tag, workflow diff, audit output, and candidate artifact before publishing.
4. Enable private vulnerability reporting in the repository Security settings. Confirm
   that the reporting route described in `SECURITY.md` is available.
5. Enable GitHub secret scanning and push protection where available.

## First publication

npm currently requires a package to exist before configuring its trusted publisher.
Do not assume that OIDC can claim a never-published package name. See
[npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites).

The bootstrap route retains the same tests and provenance as later releases:

1. In npm's account UI, create a short-lived granular publishing token, limited to the
   required package-creation/publishing permission. Where npm requires it for unattended
   CI, enable bypass 2FA on this temporary token. Never paste it into chat or commit it.
2. Store it as the environment secret `NPM_BOOTSTRAP_TOKEN` in `npm-production`.
3. Commit and push the reviewed release preparation, then create and push the matching
   `vX.Y.Z` tag. In Actions, run **Publish npm**, select that tag, and set `bootstrap=true`.
4. Review and approve the protected environment. Wait for **verify-publication** to pass;
   an accepted publish alone does not establish that the installed public package works.
5. Configure Trusted Publishing for the newly created npm package:
   - Organization/user: `yangzichao`
   - Repository: `mcp-server-overleaf`
   - Workflow filename: `release.yml`
   - Environment: `npm-production`
6. Revoke the bootstrap token and delete its GitHub secret. Restrict token publishing in
   npm's package settings after verifying the trust configuration.

If account policy prevents a bootstrap token, resolve that policy with the owner before
publishing. Do not disable provenance or ship an unverified local build to bypass it.
See [npm provenance](https://docs.npmjs.com/generating-provenance-statements/) and
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

## Subsequent publications

Run **Publish npm** on the reviewed version tag with `bootstrap=false`. npm authenticates
using the workflow's short-lived OIDC identity; no npm publishing secret is supplied.
Keep the workflow filename and environment identical to the npm trust settings.

A failed verification after npm has accepted the version does not undo publication.
Inspect the npm version and workflow logs before retrying: npm versions are immutable.
Fix a defective release in a new patch version. Deprecate a known-bad version with an
explanation when appropriate; do not move tags or pretend a failed release was never published.

## Proof to retain with a release

Record the source commit, version tag, successful workflow URL, tested tarball integrity,
public npm version and provenance page, and any limits of real Overleaf validation.
The integration suites use local Git remotes. A real Overleaf smoke check must use a
purpose-built test project, start with read-only access, and separately authorize any push.
Do not use a collaborator's active paper as release test data.
