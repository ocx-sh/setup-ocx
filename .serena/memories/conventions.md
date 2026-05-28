# Conventions

Detailed source-of-truth: `.claude/rules/github-actions.md` (security/quality), `.claude/rules/update-docs.md` (doc-sync triggers). Below = invariants worth pinning.

## Commits — Conventional Commits
Required; git-cliff parses type to bump version + generate CHANGELOG.

| Prefix | Bump |
|---|---|
| `feat:` | minor |
| `fix:` / `perf:` | patch |
| `feat!:` / `fix!:` / `BREAKING CHANGE` | major |
| `refactor:` / `docs:` / `test:` / `ci:` / `build:` / `chore:` | none |

Optional scope: `feat(download): add retry logic`.

**Never** add `Co-Authored-By` trailers, attribution lines, or similar metadata to commits, PRs, or any other content.

## File layout invariants
- Tests 1:1 with sources: `src/<name>.ts` ↔ `tests/<name>.test.ts`.
- `dist/` is committed (GitHub Actions requires it). Always rebuild + commit alongside `src/` change in same commit.
- `action.yml` = single source of truth for action interface. README inputs/outputs table mirrors it.

## TS / code
- `strict: true`. No `as <T>` casts to launder untrusted input — validate explicitly (esp. `libc` against `"gnu" | "musl"`).
- Paths: always `path.join(...)`, never string-concat with `/` (cross-platform).
- Archive extraction tar flag must match archive type produced by `getArchiveName()`:
  - `.tar.gz` → `xz`
  - `.tar.xz` → `xJ`
  Mismatch = silent failure waiting to happen.

## `@actions/core` API usage
- `core.getInput()` for strings; `core.getBooleanInput()` for bools (YAML 1.2 variants); `core.getMultilineInput()` for lists.
- `core.debug()` → diagnostic (gated by `ACTIONS_STEP_DEBUG`); `core.info()` → normal; `core.warning()`/`core.notice()` → annotations; `core.setFailed()` → fatal.
- Wrap entry in `async run()` try/catch; catch calls `core.setFailed(error.message)`.
- Use `core.startGroup()` / `core.endGroup()` to fold verbose logs.
- Never log tokens or checksums of private assets. Mask dynamic secrets via `core.setSecret()`.

## Testing
- Mock `@actions/core`, `@actions/http-client`, `@actions/tool-cache` — never hit real GitHub APIs or download real binaries.
- Use `beforeEach` to clear mocks between tests for isolation.
- Avoid `mock.module(\"../src/cache\", …)` in unrelated test files — caused cross-file pollution (see commit `5ae2768`). Mock only what the file under test needs.
- Clean up temp files in `finally` blocks.

## Workflows (`.github/workflows/`)
- Per-job `permissions` (not workflow-level). Default minimal.
- Third-party actions pinned to full-length commit SHAs (not tags).
- Never interpolate `github.event.*` into `run:` directly — go via env var.
- Windows jobs use `shell: bash` for consistency.

## Docs sync triggers
Per `.claude/rules/update-docs.md`:
- `action.yml` input/output change → README inputs/outputs table + usage example.
- `taskfile.yml` task add/rename/remove → README dev quick-start + CONTRIBUTING.
- New source file or top-level dir → CONTRIBUTING Project Layout table.
- Workflow filename change → README badges.
