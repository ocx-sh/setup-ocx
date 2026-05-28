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
task check          # test + build + verify dist is fresh
task dist:check     # Verify committed dist matches a clean build
task install        # bun install
task update:lock    # Re-resolve ocx.lock from ocx.toml
```

Use `bun` for package management (not npm).

## Architecture

Source modules in `src/` are bundled into two artifacts by `esbuild`: `dist/setup/index.js` (main entry) and `dist/save-cache/index.js` (post entry).

| Module | Responsibility |
|---|---|
| `setup.ts` | Main entry — reads inputs, orchestrates resolve → download → cache → toolchain activation |
| `save-cache.ts` | Post entry — saves binary + object-store caches deferred by the main step |
| `version.ts` | Resolves `"latest"` to a concrete version via the GitHub Releases API (with retry) |
| `constants.ts` | Maps Node.js `platform`/`arch` to Rust target triples; detects musl vs gnu libc |
| `download.ts` | Downloads archive, verifies SHA256, extracts, caches binary (overlays `@actions/cache` over `RUNNER_TOOL_CACHE`) |
| `cache.ts` | `$OCX_HOME` object store cache (selective dirs, lockfile-hash key) |
| `toolchain.ts` | Discovers `ocx.toml`, runs `ocx pull`, parses `ocx env`, exports PATH |

The `dist/` directory **is committed** — GitHub Actions require it. After any source change, run `task build` and commit both bundles. CI (`task dist:check`) will fail if either bundle is stale.

## Testing

Tests live in `tests/` and use `bun:test` with its built-in mocking (`mock.module`). Each test file maps 1:1 to a source module. Run a single test file with:

```bash
bun test tests/version.test.ts
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/). git-cliff uses the commit type to auto-detect the next version and generate the changelog.

| Prefix | Purpose | Version bump |
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

Scopes are optional: `feat(download): add retry logic`.

**Do not** add `Co-Authored-By` trailers, attribution lines, or any similar metadata to commits, PRs, or any other content.

## Updating Docs

When changing inputs/outputs (`action.yml`), tasks (`taskfile.yml`), source files, build tooling, or prerequisites, keep `README.md` and `CONTRIBUTING.md` in sync per the rules in `.claude/rules/update-docs.md`.
