# TypeScript Best Practices

Rules for writing TypeScript in this project. Aimed at a Node 24 GitHub Action — the bundle ships to runners, so type safety matters more than rapid iteration. These rules complement (not replace) `github-actions.md`.

---

## 1. Compiler Strictness

The `tsconfig.json` baseline:

- `"strict": true` — enables the full strict family (`strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `useUnknownInCatchVariables`, `alwaysStrict`).
- `"noUncheckedIndexedAccess": true` — array/object index access returns `T | undefined`. Forces explicit guards on `arr[i]` and `regexMatch[1]`.
- `"exactOptionalPropertyTypes": true` — distinguishes `{ foo?: string }` (key may be absent) from `{ foo: string | undefined }` (key present, value may be `undefined`). Stops accidental `undefined` assignment to optional props.
- `"verbatimModuleSyntax": true` — forces explicit `import type` for type-only imports; removes ambiguity between value and type imports; aligns with `isolatedModules` semantics needed by bundlers.
- `"module": "nodenext"`, `"moduleResolution": "nodenext"`, `"target": "ES2022"` — modern Node 24 alignment. Requires `.js` extensions on relative imports (TS rewrites at emit; bundler / Bun handle the rest).
- `"skipLibCheck": true` is acceptable for build speed since we ship a bundle; library types are not part of our public surface.

When adding a new compiler option, document the rationale in the same PR that flips it.

---

## 2. Type Idioms

### Imports

- Use `import type { Foo } from "./mod.js"` for any symbol used only in type position. Mixed value + type imports are allowed via `import { foo, type Bar } from "./mod.js"`.
- Always include the `.js` suffix on relative imports (Node ESM under `nodenext`).
- Never deep-import into a third-party package's internals (e.g. `@actions/http-client/lib/interfaces`) unless the package documents it as public.

### Shapes

- Prefer **discriminated unions** over optional-property soup. With `exactOptionalPropertyTypes`, a partial type often hides illegal states.
- Default to `readonly` for arrays and object fields that should not mutate after construction. Use `as const` for literal lookup tables (e.g. backoff schedules).
- Reach for type guards (`function isFoo(x: unknown): x is Foo`) over `as` casts. The only acceptable `as` is `as const` or narrowing within a proven runtime check.

### Casts

- **Never** `as Foo` to launder unvalidated input. Validate first, then narrow. For action inputs, run an explicit allowlist check (see `github-actions.md §1 Input Validation`).

---

## 3. Error & Optional Handling

### `unknown` in catch

With `useUnknownInCatchVariables` (part of `strict`), catch parameters are `unknown`. Narrow with `instanceof Error` before reading `.message`:

```ts
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  core.warning(msg);
}
```

### Index access

With `noUncheckedIndexedAccess`, treat `arr[i]` and `regex.match(...)?.[1]` as `T | undefined`. Two acceptable patterns:

```ts
const hash = checksumContent.split(/\s+/)[0] ?? "";
if (!hash) throw new Error(`Empty checksum body`);

const name = m[1]; // type: string | undefined
if (!name) continue; // narrow before use
```

### Falsy defaults

Use `??` (nullish coalescing) for defaults that may be legitimately falsy. `||` collapses `0`, `""`, `false` — usually a bug.

### Process exit

Entry point modules (`setup.ts`, `save-cache.ts`) own the top-level `run().catch(...)`. Library modules in `src/` must not call `process.exit` or `core.setFailed` — they `throw`, the entry point decides how to surface.

---

## 4. Module Boundaries

- **Minimal exports.** Only `export` symbols other modules consume. Re-running `tsc --noEmit --listFilesOnly` plus dead-code analysis (Bun's bundle warning) catches over-exports.
- **No side effects at import time.** Modules in `src/` must not perform I/O, mutate globals, or invoke `core.*` at top-level. Side effects belong inside `run()`.
- **One public entry per file.** Co-locate small private helpers. Split when a helper grows its own state or its own tests.
- **No barrel files.** Direct imports keep the dependency graph honest and the bundle small.

---

## Sources

- [TypeScript Handbook — Strictness](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#strictness)
- [TypeScript Handbook — `noUncheckedIndexedAccess`](https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess)
- [TypeScript 4.4 release notes — `exactOptionalPropertyTypes`](https://devblogs.microsoft.com/typescript/announcing-typescript-4-4/#exact-optional-property-types)
- [TypeScript 5.0 release notes — `verbatimModuleSyntax`](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/#verbatimmodulesyntax)
- [Node.js docs — ES modules with `nodenext`](https://nodejs.org/api/esm.html#esm)
- Dan Vanderkam, _Effective TypeScript_ — items 28 (Prefer Types That Always Represent Valid State), 36 (Avoid the `as` Cast), 50 (Prefer Conditional Types to Overloaded Declarations)
