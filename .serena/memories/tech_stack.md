# Tech Stack

## Runtime

- **Node 24** (action runtime + minimum local: `package.json` `engines.node >=24`).
- TypeScript 5.9, target `ES2022`, module `commonjs`, `strict: true`, `rootDir: src`, `outDir: dist` (only used by `tsc` if invoked; actual artifacts come from esbuild — see below).

## Package manager

- **Bun** (NOT npm). Lockfile: `bun.lock` (committed). Use `bun install`, `bun test`, `bun run <script>`.
- Tests run via `bun:test` with built-in `mock.module()` (no jest/vitest).

## Bundler

- **esbuild 0.27.x** invoked from `scripts/build.ts` (a Bun script).
- Output: two single-file CJS bundles — `dist/setup/index.js`, `dist/save-cache/index.js` — plus `licenses.txt` per bundle (collected from bundled package LICENSE files).
- No `npm install` at action runtime; bundle is self-contained.

## Runtime deps (kept minimal, all `@actions/*`)

- `@actions/cache` — object-store + binary cache layers
- `@actions/core` — inputs/outputs/logging
- `@actions/http-client` — HTTP (lighter than axios/node-fetch; preferred)
- `@actions/tool-cache` — extraction + tool-cache directory
- `@actions/exec` — listed; audit before removing (rule §5 calls it out as "unused — remove if still true")

## Local toolchain bootstrap

- Tool versions in `ocx.toml` (`bun:1`, `nodejs:24`, `go-task:3`, `git-cliff:2`).
- Local: `direnv allow` → `.envrc` puts `bun` + `node` on `PATH`.
- CI: `ocx-sh/setup-ocx` (this action, dogfooded) activates same toolchain.
- Tasks call binaries directly — no `ocx exec` / `ocx run` wrapper.

## Other tooling

- `go-task` (`taskfile.yml`) — task runner; see `mem:suggested_commands`.
- `git-cliff` — Conventional-Commits → CHANGELOG + version bump (`cliff.toml`).
- direnv — local PATH activation.
