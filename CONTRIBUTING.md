# Contributing to setup-ocx

This repo is the canonical home for installing OCX in CI and other scriptable environments. It ships three install surfaces from a single source of truth (see [CLAUDE.md](./CLAUDE.md) for the architecture overview): a GitHub Action, a GitLab Function, and shell installers (`sh/install.sh`, `pwsh/install.ps1`).

## Prerequisites

- **[Bun](https://bun.sh)** — runtime and test runner (TS bundle)
- **[task](https://taskfile.dev)** — primary task runner (`brew install go-task` or see docs)
- **[OCX](https://github.com/ocx-sh/ocx)** — package manager (pins Node + Bun + git-cliff versions)
- **shellcheck** — for `task lint:sh`
- **bats** + **python3** + **xz** — for `task test:install:sh` (env-knob tests)
- **pwsh** + **PSScriptAnalyzer** + **Pester 5** — for `task lint:ps1` and `task test:install:ps1`

## Project Layout

| Path | Purpose |
|------|---------|
| `src/setup.ts` | GitHub Action entry — input parsing, orchestration |
| `src/constants.ts` | Platform/arch mapping, libc detection |
| `src/version.ts` | Version resolution (`"latest"` via GitHub API) |
| `src/download.ts` | Download, checksum verification, extraction, `@actions/tool-cache` |
| `tests/` | TS unit tests (bun:test) |
| `tests/install/` | Bats + Pester tests for the shell installers |
| `scripts/build.ts` | esbuild bundler with license extraction |
| `scripts/build-gitlab-export.sh` | Produce mirror tree for `gitlab.com/ocx-sh/setup-ocx` |
| `scripts/publish-installers.sh` | rsync installers to `setup.ocx.sh` |
| `dist/setup/` | Bundled GHA output (committed, required by GitHub Actions) |
| `sh/install.sh` | Canonical POSIX installer |
| `pwsh/install.ps1` | Canonical PowerShell installer |
| `gitlab/` | GitLab Function: `func.yml`, `entrypoint.sh`, vendored `install.sh`, `Dockerfile`, `.gitlab-ci.yml` |
| `action.yml` | GitHub Action definition |
| `README.md` | GitHub repo + Marketplace listing (GHA-focused) |
| `README_GITLAB.md` | Mirrored as `README.md` to the GitLab repo (Catalog page) |

## Canonical install logic

`sh/install.sh` is the source of truth. `gitlab/install.sh` must be a byte-identical copy. After editing `sh/install.sh`:

```sh
task sync:gitlab          # copies sh/install.sh → gitlab/install.sh
```

The `verify-installers.yml` workflow runs `diff -q sh/install.sh gitlab/install.sh` on every PR and fails on drift.

The PowerShell installer (`pwsh/install.ps1`) is maintained in lockstep with `sh/install.sh` — same env knobs, same exit codes, same stdout/stderr contract. Cross-platform parity is enforced by tests (`tests/install/env-knobs.bats` + `tests/install/ps1/Knobs.Tests.ps1`), not by code generation.

## Building

```sh
task build                # bundle TS with esbuild into dist/setup/index.js
```

The `dist/` directory is committed to the repository. GitHub Actions loads the bundle directly from it.

## Running tests

```sh
task test                 # TS unit tests
task test:install:sh      # Bats env-knob tests (POSIX)
task test:install:ps1     # Pester equivalent (Windows / pwsh)
task lint:sh              # shellcheck
task lint:ps1             # PSScriptAnalyzer
task check                # TS test + build + verify dist freshness
```

The `tests/install/` suites spin up a local Python `http.server` against fixture release tarballs, then exercise the env knobs (`OCX_INSTALL_BASE_URL`, `OCX_INSTALL_FORMAT_URL`, etc.) and the stable exit codes (2, 3, 4, 7).

## GitLab Function dev loop

```sh
docker build -t setup-ocx:local gitlab/

OUT=/tmp/ocx-output.jsonl
docker run --rm \
  -e INPUT_VERSION=0.5.0 \
  -e INPUT_SKIP_BOOTSTRAP=true \
  -e OUTPUT_FILE=$OUT \
  -v /tmp:/tmp \
  setup-ocx:local /func/entrypoint.sh

cat $OUT
```

See `gitlab/README.md` for more.

## Commit conventions

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/). git-cliff infers the next semver bump from the commit type.

```
feat: add OCX_INSTALL_FORMAT_URL placeholder
feat(install): support {tag} placeholder
feat!: stdout silent on success unless PRINT_PATH=1   # major bump (breaking)
fix: handle missing checksum file
chore: update dependencies
ci: add macos to verify-deep matrix
```

**Do not** add `Co-Authored-By` trailers, attribution lines, or any similar metadata to commits, PRs, or any other content.

## Branch model

- Branch from `main` — never commit directly to `main`.
- Keep commits atomic and complete — no WIP commits on shared branches.

## Release flow

`task release` runs locally, computes the bumped version with git-cliff, updates `CHANGELOG.md`, commits, and tags. Pushing the tag triggers `.github/workflows/release.yml`, which:

1. Creates the GitHub release with notes.
2. Updates the floating major version tag (`v1`, `v2`, ...).
3. Publishes installers to `setup.ocx.sh:sh/<version>/install.sh` + `setup.ocx.sh:pwsh/<version>/install.ps1` (and the `latest` pointers).
4. Mirrors the export tree to `gitlab.com/ocx-sh/setup-ocx` (single commit per release, never force-push). The GitLab tag triggers `.gitlab-ci.yml` which builds + publishes the GLF OCI image and creates the Catalog release.

### One-time release setup (maintainers)

| Secret / setting | Where | Purpose |
|---|---|---|
| `SETUP_OCX_DEPLOY_KEY` | GitHub repo secrets, environment `setup.ocx.sh` | SSH private key for `setup-ocx@setup.ocx.sh` |
| `GITLAB_MIRROR_TOKEN` | GitHub repo secrets | GitLab project access token, scopes `write_repository` + `api` |
| Server user | `setup-ocx@setup.ocx.sh` | Pre-create `~/sh/` and `~/pwsh/` dirs; deploy key in `~/.ssh/authorized_keys` |
| DNS | `setup.ocx.sh` A/AAAA → server IP | Manual |
| Web vhost | Caddy/nginx serving `~/setup-ocx` (or wherever) | Manual |
| GitLab Catalog flag | `gitlab.com/ocx-sh/setup-ocx` Settings → General → Visibility | Flip "CI/CD Catalog resource" on (one-time) |

## Before submitting

Run the full check:

```sh
task check                # TS test + build + dist freshness
task lint:sh              # shellcheck installers + helper scripts
task test:install:sh      # env-knob coverage
task sync:gitlab          # in case install.sh changed
```

All checks must pass before opening a pull request.
