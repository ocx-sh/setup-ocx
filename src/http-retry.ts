import * as core from "@actions/core";

/**
 * Outcome of a single attempt. Pass either {@link result}/{@link response} on
 * a completed HTTP call or {@link error} when the underlying request threw.
 */
export interface Outcome<T> {
  result?: T;
  response?: { statusCode: number; headers?: Record<string, string | string[] | undefined> };
  error?: unknown;
}

export type Decision =
  | { kind: "success" }
  | { kind: "retry"; reason: string; retryAfterMs?: number }
  | { kind: "fail"; reason: string };

export interface RetryOptions {
  /** Maximum number of attempts (default 3). */
  maxAttempts?: number;
  /** Backoff delays in ms between attempts; index 0 = wait after attempt 1 (default [500, 1500, 4500]). */
  backoffMs?: readonly number[];
  /** Human label used in log + thrown messages. */
  label?: string;
  /** Cap (ms) for any Retry-After-style override so a hostile upstream can't hang us. */
  maxRetryAfterMs?: number;
}

const DEFAULT_BACKOFF: readonly number[] = [500, 1500, 4500];
const DEFAULT_MAX_RETRY_AFTER_MS = 60_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drive an idempotent async operation through bounded retries with logging.
 *
 * The classifier inspects each outcome and returns `success`, `retry` (with a
 * reason and optional Retry-After override) or `fail`. `withRetry` owns the
 * `core.warning` per attempt and the sleep between attempts. On exhaustion it
 * throws an `Error` whose message includes the label plus every per-attempt
 * reason — call sites get a self-contained failure log.
 */
export async function withRetry<T>(
  attempt: (attemptIndex: number) => Promise<Outcome<T>>,
  classify: (outcome: Outcome<T>) => Decision,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF;
  const label = opts.label ?? "operation";
  const maxRetryAfter = opts.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;

  const reasons: string[] = [];

  for (let i = 0; i < maxAttempts; i++) {
    const outcome = await attempt(i);
    const decision = classify(outcome);

    if (decision.kind === "success") {
      if (outcome.result === undefined) {
        // Classifier asserted success but produced no value; treat as bug.
        throw new Error(`${label}: classifier returned success without a result`);
      }
      if (i > 0) {
        core.info(`${label}: resolved after ${i + 1} attempts.`);
      }
      return outcome.result;
    }

    if (decision.kind === "fail") {
      reasons.push(`attempt ${i + 1}: ${decision.reason}`);
      throw new Error(`${label} failed: ${reasons.join("; ")}`);
    }

    reasons.push(`attempt ${i + 1}: ${decision.reason}`);

    if (i < maxAttempts - 1) {
      const baseDelay = backoff[Math.min(i, backoff.length - 1)] ?? 0;
      const delay =
        decision.retryAfterMs !== undefined
          ? Math.min(decision.retryAfterMs, maxRetryAfter)
          : baseDelay;
      core.warning(`${label}: ${decision.reason}; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw new Error(`${label} failed after ${maxAttempts} attempts: ${reasons.join("; ")}`);
}

/**
 * Parse a `Retry-After` header value (seconds or HTTP date) into milliseconds.
 * Returns `undefined` if the value is missing or unparseable.
 */
export function parseRetryAfterMs(value: string | string[] | undefined): number | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : 0;
  }
  return undefined;
}
