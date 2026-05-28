# Task Completion Checklist

Run before declaring any coding task done.

## Mandatory

```bash
task check
```

Equivalent to:

1. `task test` — `bun test` (all unit tests pass)
2. `task build` — rebuild `dist/setup/index.js` + `dist/save-cache/index.js` via `bun scripts/build.ts`
3. `task dist:check` — `git diff --exit-code dist/` (CI hard-fails on drift)

If `dist:check` fails, you forgot to commit the rebuilt bundle — `git add dist/` and amend or add to the same commit as the `src/` change.

## When `action.yml` changed

- Update README inputs/outputs table.
- Add/update usage example if a new input warrants one.

## When `taskfile.yml` changed

- Update README dev quick-start.
- Update CONTRIBUTING tasks section.

## When `src/` modules added/renamed/removed

- Update CONTRIBUTING Project Layout table.
- Add/rename matching `tests/<name>.test.ts`.

## When CI workflow file renamed

- Update README badge URLs (badges reference workflow filename).

## No type-check / lint step

There is no separate `tsc` or eslint task. `strict: true` is enforced via esbuild + Bun's TS handling; type errors surface during `task build` / `bun test`.

## No linter / formatter step

Not configured. Don't run `prettier` / `eslint` — they'd produce drift not enforced by CI.

## Commit hygiene

- Conventional Commits prefix (see `mem:conventions`).
- No `Co-Authored-By` or attribution trailers anywhere.
- Stage specific files; avoid `git add -A` / `git add .` (risk of pulling in `.env`, secrets, build noise).
