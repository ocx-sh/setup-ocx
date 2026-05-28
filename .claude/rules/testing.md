# Testing Best Practices (bun:test)

Rules for writing and maintaining unit tests in this project. We target `bun test` exclusively — no Jest, no Vitest. Tests must run offline, deterministic, and complete in under a few seconds end-to-end.

---

## 1. Layout

- **1:1 src ↔ test mapping.** Every module under `src/` has a sibling under `tests/` of the same name with `.test.ts` suffix. Entry points (`setup.ts`, `save-cache.ts`) are not exceptions.
- **No real network or shared filesystem.** Mock `@actions/core`, `@actions/http-client`, `@actions/tool-cache`, `@actions/cache`, `@actions/exec`. Tests must pass without internet.
- **Temp paths via `os.tmpdir()`.** Any real FS write happens under `path.join(os.tmpdir(), "setup-ocx-<rand>")` and is cleaned up in a `finally` block.
- **No tests depend on test order.** Each test sets up its own fixtures.

---

## 2. Mocking Strategy

`bun:test` exposes three primitives — pick the right one:

| API                          | When to use                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `mock.module(path, factory)` | Replace an entire module's surface. Side effect — affects all importers. Hoist into the shared preload.   |
| `mock(fn)`                   | Create a standalone mock function (e.g. as a callback).                                                   |
| `spyOn(obj, "method")`       | Per-test override of one method on an already-mocked module. Combine with `.mockImplementationOnce(...)`. |

### Shared preload

The repo uses `bunfig.toml`:

```toml
[test]
preload = ["./tests/setup-mocks.ts"]
```

`tests/setup-mocks.ts` is **the only place** `mock.module()` for `@actions/*` should appear. Test files import the mock handles from it and override per-test with `spyOn`. This eliminates last-import-wins ordering bugs.

### Reset hygiene

Every test file installs:

```ts
import { beforeEach, afterEach, mock } from "bun:test";

beforeEach(() => {
  mock.clearAllMocks();
});
afterEach(() => {
  mock.restore();
});
```

`clearAllMocks()` wipes call history; `restore()` reverts `spyOn` overrides. Without both, state leaks between tests.

### Forbidden patterns

- Re-declaring `mock.module("@actions/core", ...)` inside individual test files.
- `await import("../src/foo")` after a top-of-file `mock.module` — the dynamic-import dance is the symptom of a missing preload.
- Mutating exported state from one test file expecting another to read it.

---

## 3. Assertions

- **Behaviour, not implementation.** Assert on observable outputs — `core.setOutput`, `core.exportVariable`, `tc.cacheDir`, thrown errors. Avoid asserting helper call counts that the implementation can legitimately refactor.
- **Always test the negative path.** For every "happy path" test, write a matching test for the failure case: `core.setFailed` called, checksum mismatch throws, exhausted retries throw with combined history.
- **Lock error message contracts with regex.** `expect(() => fn()).toThrow(/Invalid libc value/)` — survives wording polishing better than substring matches.
- **Use `expect.objectContaining` sparingly.** Prefer exact shape assertions; loose matchers hide regressions.

---

## 4. Coverage

- **Threshold gate** in `bunfig.toml`:
  ```toml
  coverageThreshold = { line = 0.85, function = 0.85, statement = 0.85 }
  ```
- **LCOV reporter for CI**:
  ```sh
  bun test --coverage --coverage-reporter=lcov
  ```
  writes `coverage/lcov.info`. CI uploads to Codecov.
- **Codecov gates**: 85 % project / 90 % patch. The patch gate forces any new code to be well-covered, independent of the project floor.
- **Entry points must be in scope.** `setup.ts` and `save-cache.ts` are the most user-visible files — if either drops out of coverage (e.g. accidentally listed under `coveragePathIgnorePatterns`), that's a bug.
- **Ignored paths**: `dist/`, `scripts/`, `tests/` only. Never ignore a `src/` file to game the gate.

---

## Sources

- [Bun docs — Test runner](https://bun.sh/docs/test/writing)
- [Bun docs — Mocks](https://bun.sh/docs/test/mocks)
- [Bun docs — Code coverage](https://bun.sh/docs/test/coverage)
- [Bun docs — bunfig.toml reference](https://bun.sh/docs/runtime/bunfig)
- [Codecov docs — Status checks](https://docs.codecov.com/docs/commit-status)
- [Codecov docs — Coverage standards with flags](https://docs.codecov.com/docs/github-5b-setting-coverage-standards-with-flags)
- Kent C. Dodds, _Avoid the Test User_
- Martin Fowler, _Mocks Aren't Stubs_
