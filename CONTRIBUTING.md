# Contributing to setup-ocx

## Prerequisites

- **[Bun](https://bun.sh)** — runtime and test runner
- **[task](https://taskfile.dev)** — primary task runner (`brew install go-task` or see docs)
- **[OCX](https://github.com/ocx-sh/ocx)** — package manager (used for pinning tool versions)

## Project Layout

| Path | Purpose |
|------|---------|
| `src/setup.ts` | Action entry point — input parsing, orchestration |
| `src/constants.ts` | Platform/architecture mapping, libc detection |
| `src/version.ts` | Version resolution (`"latest"` via GitHub API) |
| `src/download.ts` | Download, checksum verification, extraction, caching |
| `tests/` | Unit tests (bun:test) |
| `dist/setup/` | Bundled output (committed, required by GitHub Actions) |
| `action.yml` | GitHub Action definition |

## Building

```sh
task build         # bundle with ncc into dist/setup/index.js
```

The `dist/` directory is committed to the repository. GitHub Actions loads the bundle directly from it.

## Running Tests

```sh
task test          # run unit tests
task test:watch    # run in watch mode
task check         # test + build + verify dist is up to date
```

## Commit Conventions

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add version file support
fix: handle missing checksum file
chore: update dependencies
ci: add macos to verify-deep matrix
```

## Branch Model

- Branch from `main` — never commit directly to `main`.
- Keep commits atomic and complete — no WIP commits on shared branches.

## Before Submitting

Run the full check:

```sh
task check    # test + build + verify dist matches source
```

All checks must pass before opening a pull request.
