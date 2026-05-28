import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { coreMocks, resetMocks } from "./setup-mocks.js";
import { parseRetryAfterMs, withRetry } from "../src/http-retry.js";
import type { Decision, Outcome } from "../src/http-retry.js";

beforeEach(() => {
  resetMocks();
});

afterEach(() => {
  mock.restore();
});

describe("withRetry", () => {
  test("returns result immediately on first success", async () => {
    const attempt = mock((): Promise<Outcome<string>> => Promise.resolve({ result: "ok" }));
    const classify = (o: Outcome<string>): Decision =>
      o.result ? { kind: "success" } : { kind: "fail", reason: "no result" };
    const out = await withRetry(attempt, classify, { label: "x", backoffMs: [1, 1, 1] });
    expect(out).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(coreMocks.warning).not.toHaveBeenCalled();
  });

  test("retries on retry decision until success", async () => {
    let n = 0;
    const attempt = mock(
      (): Promise<Outcome<string>> =>
        Promise.resolve(n++ < 2 ? { error: new Error("boom") } : { result: "ok" }),
    );
    const classify = (o: Outcome<string>): Decision =>
      o.error instanceof Error
        ? { kind: "retry", reason: o.error.message }
        : o.result
          ? { kind: "success" }
          : { kind: "fail", reason: "no result" };
    const out = await withRetry(attempt, classify, { label: "x", backoffMs: [1, 1, 1] });
    expect(out).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(coreMocks.warning).toHaveBeenCalledTimes(2);
  });

  test("aborts immediately on fail decision", async () => {
    const attempt = mock(
      (): Promise<Outcome<string>> => Promise.resolve({ error: new Error("4xx") }),
    );
    const classify = (): Decision => ({ kind: "fail", reason: "HTTP 401" });
    await expect(
      withRetry(attempt, classify, { label: "auth", backoffMs: [1, 1, 1] }),
    ).rejects.toThrow(/auth failed: attempt 1: HTTP 401/);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  test("throws after maxAttempts with joined reasons", async () => {
    const attempt = mock(
      (): Promise<Outcome<string>> => Promise.resolve({ response: { statusCode: 503 } }),
    );
    const classify = (): Decision => ({ kind: "retry", reason: "HTTP 503" });
    await expect(
      withRetry(attempt, classify, {
        label: "fetch",
        maxAttempts: 3,
        backoffMs: [1, 1, 1],
      }),
    ).rejects.toThrow(
      /fetch failed after 3 attempts: attempt 1: HTTP 503; attempt 2: HTTP 503; attempt 3: HTTP 503/,
    );
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  test("honours retryAfterMs over default backoff", async () => {
    let calls = 0;
    const attempt = mock((): Promise<Outcome<string>> => {
      calls++;
      return Promise.resolve(calls < 2 ? { response: { statusCode: 429 } } : { result: "ok" });
    });
    const classify = (o: Outcome<string>): Decision =>
      o.response?.statusCode === 429
        ? { kind: "retry", reason: "HTTP 429", retryAfterMs: 5 }
        : { kind: "success" };
    const t0 = Date.now();
    const out = await withRetry(attempt, classify, {
      label: "x",
      backoffMs: [10_000, 10_000],
      maxRetryAfterMs: 100,
    });
    const elapsed = Date.now() - t0;
    expect(out).toBe("ok");
    // Should sleep only ~5ms, not 10s.
    expect(elapsed).toBeLessThan(1000);
  });

  test("caps retryAfterMs at maxRetryAfterMs", async () => {
    let calls = 0;
    const attempt = mock((): Promise<Outcome<string>> => {
      calls++;
      return Promise.resolve(calls < 2 ? { response: { statusCode: 503 } } : { result: "ok" });
    });
    const classify = (o: Outcome<string>): Decision =>
      o.response?.statusCode === 503
        ? { kind: "retry", reason: "HTTP 503", retryAfterMs: 60_000 }
        : { kind: "success" };
    const t0 = Date.now();
    const out = await withRetry(attempt, classify, {
      label: "y",
      backoffMs: [10_000],
      maxRetryAfterMs: 10,
    });
    const elapsed = Date.now() - t0;
    expect(out).toBe("ok");
    expect(elapsed).toBeLessThan(1000);
  });

  test("throws when classifier returns success without a result (caller bug)", async () => {
    const attempt = mock((): Promise<Outcome<string>> => Promise.resolve({}));
    const classify = (): Decision => ({ kind: "success" });
    await expect(
      withRetry(attempt, classify, { label: "buggy", backoffMs: [1, 1, 1] }),
    ).rejects.toThrow(/classifier returned success without a result/);
  });

  test("logs 'resolved after N attempts' on eventual success", async () => {
    let n = 0;
    const attempt = mock(
      (): Promise<Outcome<string>> =>
        Promise.resolve(n++ < 1 ? { error: new Error("e") } : { result: "ok" }),
    );
    const classify = (o: Outcome<string>): Decision =>
      o.error ? { kind: "retry", reason: "x" } : { kind: "success" };
    await withRetry(attempt, classify, { label: "fetch", backoffMs: [1, 1, 1] });
    expect(coreMocks.info).toHaveBeenCalledWith(
      expect.stringContaining("fetch: resolved after 2 attempts"),
    );
  });
});

describe("parseRetryAfterMs", () => {
  test("parses integer seconds", () => {
    expect(parseRetryAfterMs("5")).toBe(5000);
  });

  test("parses fractional seconds", () => {
    expect(parseRetryAfterMs("0.5")).toBe(500);
  });

  test("parses HTTP date in the future", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).toBeDefined();
    expect(ms!).toBeGreaterThan(5_000);
    expect(ms!).toBeLessThan(15_000);
  });

  test("returns 0 for HTTP date in the past", () => {
    const past = new Date(Date.now() - 10_000).toUTCString();
    expect(parseRetryAfterMs(past)).toBe(0);
  });

  test("returns undefined on missing / unparseable values", () => {
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs("")).toBeUndefined();
    expect(parseRetryAfterMs("not-a-number-or-date")).toBeUndefined();
  });

  test("accepts array form and uses first element", () => {
    expect(parseRetryAfterMs(["3", "ignored"])).toBe(3000);
  });
});
