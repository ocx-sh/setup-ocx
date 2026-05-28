# Contributing to setup-ocx

## Prerequisites

- **[OCX](https://github.com/ocx-sh/ocx)** — package manager
- **[direnv](https://direnv.net)** — auto-activates the project toolchain via `.envrc`

All other tools (`bun`, `node`, `task`, `git-cliff`) are pinned in `ocx.toml`
and materialized on demand. After cloning, run `direnv allow` to put them on
your `PATH`.

## Project Layout

| Path                    | Purpose                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `src/setup.ts`          | Action main entry — input parsing, binary install, project activation |
| `src/save-cache.ts`     | Action post entry — saves binary + object-store caches                |
| `src/constants.ts`      | Platform/architecture mapping, libc detection                         |
| `src/version.ts`        | Version resolution (`"latest"` via GitHub API, with retry)            |
| `src/download.ts`       | Download, checksum verification, extraction, binary cache overlay     |
| `src/cache.ts`          | `$OCX_HOME` object store cache (selective dirs, lockfile-hash key)    |
| `src/project.ts`        | `ocx.toml` discovery, `ocx pull`, `ocx env` parsing                   |
| `src/http-retry.ts`     | Generic `withRetry()` helper (exp. backoff + Retry-After)             |
| `ocx.toml` / `ocx.lock` | Project toolchain (used locally + by CI dogfood jobs)                 |
| `tests/`                | Unit tests (bun:test)                                                 |
| `tests/setup-mocks.ts`  | Shared `@actions/*` mocks preloaded via `bunfig.toml`                 |
| `scripts/build.ts`      | esbuild bundler script — emits two bundles + license files            |
| `dist/setup/`           | Bundled main entry (committed, required by GitHub Actions)            |
| `dist/save-cache/`      | Bundled post entry (committed, required by GitHub Actions)            |
| `action.yml`            | GitHub Action definition                                              |

## Building

```sh
task build         # bundle with esbuild into dist/setup + dist/save-cache
```

The `dist/` directory is committed — GitHub Actions loads bundles directly
from it. Both bundles regenerate `licenses.txt` alongside themselves. CI's
`task dist:check` fails the build if either bundle drifts from source.

## Running Tests

```sh
task test           # run unit tests
task test:watch     # run in watch mode
task test:coverage  # tests with coverage (writes coverage/lcov.info)
task lint           # ESLint over src + tests
task fmt            # auto-format with Prettier
task fmt:check      # fail if formatting drifts (CI gate)
task check          # fmt:check → lint → coverage → build → dist freshness
```

Coverage is enforced at 85 % project / 90 % patch (see `codecov.yml`).
CI uploads `coverage/lcov.info` to Codecov via the `coverage` job in
`.github/workflows/verify-basic.yml`.

## Commit Conventions

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add project auto-activation
fix: retry GitHub API on transient empty responses
chore: update dependencies
ci: run integration tests on PRs
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
