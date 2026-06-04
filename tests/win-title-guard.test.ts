import { describe, expect, it } from "bun:test";

/**
 * `win-title-guard.ts` is a side-effect-only module: importing it runs
 * `guardWindowsProcessTitle()` once, at import time, before any `@actions/*`
 * module body. The function's branch matrix is covered in `constants.test.ts`;
 * here we only assert the side-effect import is safe on the host platform.
 *
 * On non-Windows hosts (the CI test runner) the guard is a no-op, so importing
 * the module must neither throw nor mutate the process title.
 */
describe("win-title-guard", () => {
  it("imports without throwing and is a no-op off Windows", async () => {
    const before = process.title;

    await import("../src/win-title-guard.ts");

    if (process.platform !== "win32") {
      expect(process.title).toBe(before);
    }
  });
});
