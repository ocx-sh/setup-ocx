# setup-ocx — Core

GitHub Action installing OCX package manager into CI runners. Node 24 JS action (`runs.using: node24`).

## Source map

`src/` → bundled by esbuild into two committed entrypoints under `dist/`:

| Entry                      | Source              | Responsibility                                                                      |
| -------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `dist/setup/index.js`      | `src/setup.ts`      | main — read inputs → resolve version → download+verify → cache → activate project   |
| `dist/save-cache/index.js` | `src/save-cache.ts` | post (`post-if: success()`) — saves binary + object-store caches deferred from main |

Module map (under `src/`):

| Module         | Role                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `version.ts`   | Resolve `"latest"` → concrete version via GitHub Releases API (with retry)                                  |
| `constants.ts` | Map Node `platform`/`arch` → Rust target triples; detect musl vs gnu libc                                   |
| `download.ts`  | Download archive, verify SHA256, extract, cache binary (overlays `@actions/cache` over `RUNNER_TOOL_CACHE`) |
| `cache.ts`     | `$OCX_HOME` object-store cache (selective dirs, lockfile-hash key)                                          |
| `project.ts`   | Discover `ocx.toml`, run `ocx pull`, parse `ocx env`, export PATH                                           |

Tests in `tests/` map 1:1 to `src/` modules (`tests/<name>.test.ts`).

Build script: `scripts/build.ts` (esbuild bundling + `licenses.txt` generation).

## Invariants

- `dist/` **is committed** and must stay in sync with `src/` — CI (`task dist:check`) hard-fails on drift. After any `src/` edit, run `task build` and commit both bundles in same commit.
- `action.yml` is the single source of truth for inputs/outputs. Keep README inputs/outputs table in sync.
- SHA256 verification of downloaded archive is mandatory; mismatch must throw (never proceed with unverified binary).
- `libc` input must be validated against `"gnu" | "musl"`; never cast arbitrary string `as Libc`.
- Tokens never logged; pass via `Authorization` header, not URL.
- Workflows: per-job `permissions`, third-party actions pinned to commit SHAs (not tags), `shell: bash` on Windows.

## Sub-memories

- Languages, runtime, package manager, bundler — `mem:tech_stack`
- Project tasks (`task ...`), bun usage, local PATH bootstrap — `mem:suggested_commands`
- Code style, naming, archive-extraction flag rules, logging API choices — `mem:conventions`
- Definition-of-done commands before declaring a coding task complete — `mem:task_completion`
- Memory file/reference policy itself — `mem:memory_maintenance`
