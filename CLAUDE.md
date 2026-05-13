# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`setup-ocx` is the canonical home for installing [OCX](https://ocx.sh) in CI and other scriptable environments. It ships:

- a **GitHub Action** (`action.yml` + bundled `dist/setup/index.js`)
- a **GitLab Function** (`gitlab/`), built and published from a mirror of this repo at `gitlab.com/ocx-sh/setup-ocx`
- canonical **shell installers** (`sh/install.sh`, `pwsh/install.ps1`) hosted at `setup.ocx.sh/{sh,pwsh}` (per-version + latest)

The GitHub repo is source of truth; the GitLab mirror is derived. The shell installers were previously housed in `ocx/website/src/public/`; that location is being deprecated.

## Commands

All tasks run through [Task](https://taskfile.dev). Most execute inside an OCX environment (`ocx exec nodejs:24 bun:1.3 git-cliff:2.12 --`):

```bash
task build                    # Bundle GHA TS with esbuild → dist/setup/index.js
task test                     # bun test (TS unit tests)
task check                    # test + build + dist freshness
task dist:check               # Verify committed dist matches clean build
task install                  # bun install

task lint:sh                  # shellcheck installers + helper scripts
task lint:ps1                 # PSScriptAnalyzer on install.ps1
task test:install:sh          # Bats env-knob tests against fixture HTTP server
task test:install:ps1         # Pester equivalent (Windows / pwsh)

task sync:gitlab              # Copy sh/install.sh → gitlab/install.sh (drift-checked in CI)

task release                  # git-cliff bump + tag + commit (pushes trigger CI release)
```

Use `bun` for TS package management (not npm).

## Architecture

| Path | Responsibility |
|---|---|
| `src/setup.ts` | GHA entry — reads inputs, orchestrates resolve → download → cache → output |
| `src/version.ts` | Resolves `"latest"` via GitHub Releases API |
| `src/constants.ts` | Maps Node `platform`/`arch` to Rust target triples; detects musl vs gnu libc |
| `src/download.ts` | Downloads archive, verifies SHA256, extracts, caches via `@actions/tool-cache` |
| `dist/setup/index.js` | esbuild bundle (committed; GHA loads it directly) |
| `sh/install.sh` | Canonical POSIX installer (Linux/macOS). CI-grade env knobs (`OCX_INSTALL_*`), stable exit codes 0–7, stderr-by-default |
| `pwsh/install.ps1` | Canonical PowerShell installer (Windows). Mirrors the sh env knobs |
| `gitlab/func.yml` | GitLab Function spec (inputs/outputs + `exec:`) |
| `gitlab/entrypoint.sh` | Bridges GLF `INPUT_*` env to `OCX_INSTALL_*`, runs install.sh, emits JSONL outputs |
| `gitlab/install.sh` | Vendored copy of `sh/install.sh` (must match byte-for-byte) |
| `gitlab/Dockerfile` | Alpine + curl + tar + xz |
| `gitlab/.gitlab-ci.yml` | Tag-triggered build/publish/release pipeline using GitLab builtin OCI functions |
| `scripts/build-gitlab-export.sh` | Produces clean tree for the GitLab mirror |
| `scripts/publish-installers.sh` | rsync installers to `setup.ocx.sh:sh/{VERSION,latest}/` and `:pwsh/...` |
| `tests/install/` | Bats + Pester for env-knob coverage with a fixture HTTP server |
| `README.md` | GitHub repo + Marketplace listing (GHA-focused) |
| `README_GITLAB.md` | Mirrored as `README.md` to the GitLab repo (Catalog page) |

The `dist/` directory **is committed** — GitHub Actions loads it directly. After any TS source change, run `task build` and commit the updated bundle. CI (`task dist:check`) fails on drift.

`gitlab/install.sh` **must equal** `sh/install.sh`. After editing the canonical file, run `task sync:gitlab`. The `verify-installers.yml` workflow fails on drift.

## Stdout/stderr contract

`sh/install.sh` and `pwsh/install.ps1` v2.x:
- All informational/warning/error messages go to **stderr**.
- **stdout** is silent on success unless `OCX_INSTALL_PRINT_PATH=1` (or `-PrintPath`), in which case the **final stdout line** is the absolute OCX bin dir.
- This is how the GLF entrypoint captures the install path. Pre-2.0 callers that grep stdout must adapt.

## Exit codes (sh + pwsh)

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic / legacy |
| 2 | Argument or environment validation |
| 3 | Network / download / API failure |
| 4 | Checksum mismatch |
| 5 | Archive extraction failure |
| 6 | Bootstrap (`ocx --remote install`) failure |
| 7 | Unsupported platform / architecture |

## Testing

- **TS unit tests** (`tests/*.test.ts`) use `bun:test` + `mock.module()`. One file per source module.
- **Installer env-knob tests** (`tests/install/env-knobs.bats`) spin a Python `http.server` against fixture release tarballs and exercise `OCX_INSTALL_BASE_URL`, `OCX_INSTALL_FORMAT_URL`, `OCX_INSTALL_PRINT_PATH`, exit codes 2/3/4.
- **Real-release integration** (`.github/workflows/verify-installers.yml`) runs both installers on Ubuntu/Alpine/macOS/Windows against actual GitHub releases.
- **GLF drift check** runs `diff -q sh/install.sh gitlab/install.sh` on every PR.

## Releases

- Conventional Commits drive versioning via [git-cliff](https://git-cliff.org).
- `task release` produces the version commit + tag locally; pushing the tag triggers `.github/workflows/release.yml`.
- Release workflow does: GH release (git-cliff notes) → publish installers to `setup.ocx.sh` → mirror push to `gitlab.com/ocx-sh/setup-ocx`. The mirror's tag triggers GitLab CI which builds + publishes the GLF OCI image and registers the Catalog release.

| Prefix | Purpose | Version bump (post-1.0) |
|---|---|---|
| `feat:` | New feature | minor |
| `fix:` | Bug fix | patch |
| `feat!:` / `fix!:` / `BREAKING CHANGE` | Breaking change | major |
| `perf:` | Performance improvement | patch |
| `refactor:` | Code restructuring | — |
| `docs:` | Documentation | — |
| `test:` | Tests | — |
| `ci:` | CI/CD changes | — |
| `build:` | Build system / dependencies | — |
| `chore:` | Maintenance | — |

Scopes are optional: `feat(install): add OCX_INSTALL_FORMAT_URL`.

**Do not** add `Co-Authored-By` trailers, attribution lines, or any similar metadata to commits, PRs, or any other content.

## Required release secrets

| Secret | Scope | Used by |
|---|---|---|
| `SETUP_OCX_DEPLOY_KEY` | SSH private key for `setup-ocx@setup.ocx.sh` | `publish-installers` job |
| `GITLAB_MIRROR_TOKEN` | GitLab project access token, scopes `write_repository` + `api` | `mirror-gitlab` job |

GitLab Catalog also requires a one-time **manual** project flag flip on `gitlab.com/ocx-sh/setup-ocx`: Settings → General → Visibility → "CI/CD Catalog resource".

## Updating Docs

When changing inputs/outputs (`action.yml`), tasks (`taskfile.yml`), source files, installer env knobs, or prerequisites, keep `README.md`, `README_GITLAB.md`, and `CONTRIBUTING.md` in sync per the rules in `.claude/rules/update-docs.md`. Installer-specific conventions (env-knob naming, exit codes, output discipline) live in `.claude/rules/installers.md`.
