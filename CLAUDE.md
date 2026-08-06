# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`setup-ocx` is a GitHub Action that installs the [OCX](https://ocx.sh) package manager into CI runners. It downloads a platform-specific binary, verifies its SHA256 checksum, caches it via `@actions/tool-cache`, and exposes the path. Runs on Node 24.

## Commands

Tool versions live in `ocx.toml`. Locally, `direnv allow` puts `bun` + `node` on
`PATH` via `.envrc`. In CI, `ocx-sh/setup-ocx` activates the same toolchain. Tasks
invoke `bun` / `node` directly — no `ocx exec` / `ocx run` wrapper.

```bash
task build          # Bundle with esbuild → dist/setup + dist/save-cache
task test           # Run unit tests (bun test)
task test:watch     # Tests in watch mode
task test:coverage  # Tests with coverage (writes coverage/lcov.info)
task lint           # ESLint over src + tests
task fmt            # Prettier auto-format
task fmt:check      # Prettier --check (CI gate)
task check          # fmt:check → lint → coverage → build → dist freshness
task dist:check     # Verify committed dist matches a clean build
task install        # bun install
task update:lock    # Re-resolve ocx.lock from ocx.toml
```

Use `bun` for package management (not npm).

## Architecture

Source modules in `src/` are bundled into two artifacts by `esbuild`: `dist/setup/index.js` (main entry) and `dist/save-cache/index.js` (post entry).

| Module               | Responsibility                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup.ts`           | Main entry — reads inputs, orchestrates resolve → download → cache → project activation                                                                        |
| `save-cache.ts`      | Post entry — saves binary + object-store caches deferred by the main step                                                                                      |
| `version.ts`         | Resolves `"latest"` to a concrete version via the GitHub Releases API (with retry) + `compareVersions()` semver floor comparison                               |
| `constants.ts`       | Maps Node.js `platform`/`arch` to Rust target triples; detects musl vs gnu libc                                                                                |
| `download.ts`        | Downloads archive, verifies SHA256, extracts, caches binary (overlays `@actions/cache` over `RUNNER_TOOL_CACHE`)                                               |
| `cache.ts`           | `$OCX_HOME` object store cache (selective dirs, lockfile-hash key)                                                                                             |
| `project.ts`         | Discovers `ocx.toml`, runs `ocx pull`, then `ocx env --ci=github` (ocx writes `$GITHUB_PATH`/`$GITHUB_ENV`)                                                    |
| `managed-config.ts`  | Adopts/refreshes the `[managed]` config tier via `ocx config setup`, run before project activation                                                             |
| `http-retry.ts`      | Generic `withRetry()` helper — exponential backoff + Retry-After support                                                                                       |
| `win-title-guard.ts` | Side-effect import (first in each entry) — sets `process.title` to preempt the libuv `process_title` abort on Windows before any `@actions/*` module evaluates |

The `dist/` directory **is committed** — GitHub Actions require it. After any source change, run `task build` and commit both bundles. CI (`task dist:check`) will fail if either bundle is stale.

## Testing

Tests live in `tests/` and use `bun:test`. The shared mock surface lives in
`tests/setup-mocks.ts` and is preloaded via `bunfig.toml` — individual test
files import handle objects (`coreMocks`, `tcMocks`, `cacheMocks`, …) and
override per-test with `spyOn(...).mockImplementationOnce(...)`. Each test
file 1:1-maps to a source module. Run a single file with:

```bash
bun test tests/version.test.ts
bun test --coverage           # lcov.info + threshold gate (85 %)
```

Coverage uploads to Codecov via the `coverage` job in `verify-basic.yml`.
The repo enforces 85 % project / 90 % patch in `codecov.yml`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/). git-cliff uses the commit type to auto-detect the next version and generate the changelog.

| Prefix                                 | Purpose                     | Version bump |
| -------------------------------------- | --------------------------- | ------------ |
| `feat:`                                | New feature                 | minor        |
| `fix:`                                 | Bug fix                     | patch        |
| `feat!:` / `fix!:` / `BREAKING CHANGE` | Breaking change             | major        |
| `perf:`                                | Performance improvement     | patch        |
| `refactor:`                            | Code restructuring          | —            |
| `docs:`                                | Documentation               | —            |
| `test:`                                | Tests                       | —            |
| `ci:`                                  | CI/CD changes               | —            |
| `build:`                               | Build system / dependencies | —            |
| `chore:`                               | Maintenance                 | —            |

Scopes are optional: `feat(download): add retry logic`.

**Do not** add `Co-Authored-By` trailers, attribution lines, or any similar metadata to commits, PRs, or any other content.

## Rules

Repo-specific Claude rules live under `.claude/rules/`:

- [`github-actions.md`](.claude/rules/github-actions.md) — security, metadata, error handling, supply chain.
- [`typescript.md`](.claude/rules/typescript.md) — strict compiler, type idioms, error/optional handling, module boundaries.
- [`testing.md`](.claude/rules/testing.md) — bun:test layout, shared mocks, reset hygiene, coverage thresholds.
- [`resilience.md`](.claude/rules/resilience.md) — when/how to retry, `withRetry()` shape, failover.
- [`update-docs.md`](.claude/rules/update-docs.md) — when to update README/CONTRIBUTING.

## Updating Docs

When changing inputs/outputs (`action.yml`), tasks (`taskfile.yml`), source files, build tooling, or prerequisites, keep `README.md` and `CONTRIBUTING.md` in sync per the rules in `.claude/rules/update-docs.md`.
