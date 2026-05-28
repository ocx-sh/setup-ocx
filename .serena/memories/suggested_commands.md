# Suggested Commands

All project commands go through `task` (go-task). Tool binaries (`bun`, `node`, `task`, `git-cliff`) reach `PATH` via direnv locally / `setup-ocx` in CI.

## Daily loop
```bash
task install        # bun install
task test           # bun test (unit tests in tests/)
task test:watch     # tests in watch mode
task build          # bun scripts/build.ts → dist/setup + dist/save-cache
task check          # test + build + dist:check (full preflight)
task dist:check     # git diff --exit-code dist/  (catches stale bundles)
```

Run single test file:
```bash
bun test tests/version.test.ts
```

## Maintenance
```bash
task update:lock          # ocx lock — re-resolve ocx.lock from ocx.toml
task update:bun-packages  # bun update --latest
task update               # both of the above
task release              # git-cliff: bump CHANGELOG, tag (does NOT push)
```

After `task release`, push manually:
```bash
git push origin main
git push origin <version-tag>
```

## Bun rules
- Use `bun install` / `bun add` / `bun remove` / `bun update`. Never `npm`.
- Tests: `bun test` (NOT `bun run test` — picks up `bun:test` directly).

## System (Linux) notes
Standard GNU coreutils — no project-specific deviations from a normal Linux shell. `gh` CLI used for GitHub interactions in CI debugging.
