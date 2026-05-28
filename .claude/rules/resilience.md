# Resilience: Retries, Backoff, Failover

Rules for handling transient failures in this action. The trigger for these rules was a real GitHub Releases API outage that broke `setup-ocx` until we added retry. This file codifies the pattern so every new network call gets it for free.

---

## 1. When to Retry

Retry **only** for transient classes:

- Network-layer errors: connection reset, DNS failure, timeout, `ECONNREFUSED`, `ETIMEDOUT`.
- HTTP status codes: `5xx`, `408 Request Timeout`, `429 Too Many Requests`.
- Malformed or empty responses where the contract was a non-empty body (e.g. `releases/latest` returning `200` with no `tag_name`).

**Never** retry:

- `4xx` other than `408` / `429`. Auth (`401`/`403`), validation (`400`/`422`), not-found (`404`), gone (`410`) are terminal. Retrying masks bugs and burns rate-limit budget.
- Non-idempotent operations. Only `GET` and `HEAD` are safe; `POST`/`PUT`/`PATCH`/`DELETE` need an idempotency key the server respects, which GitHub's REST API does not provide for our use cases.

---

## 2. How to Retry

- **Cap attempts.** Default `MAX_ATTEMPTS = 3`. Higher caps belong with explicit justification in the call site.
- **Exponential backoff.** Current schedule: `[500, 1500, 4500]` ms (factor 3). Add small jitter when call sites multiply — synchronized retries from many runners hammer the upstream.
- **Honour `Retry-After`.** When the response carries `Retry-After: <seconds>` (typical on 429 / 503), override the computed delay with the server's value. Cap at a sane upper bound (e.g. 60 s) to avoid pathological hangs.
- **Per-attempt logging.** Emit `core.warning` on each retry with the classified reason ("HTTP 503", "network ECONNRESET", "empty release body"). Aggregate the per-attempt notes into the final thrown `Error.message` so the failure log is self-contained.
- **Never log the Authorization header**, request body, or response body if it may carry tokens. Log status code + classification only.

---

## 3. Code Shape

- **Single helper.** All retries route through `src/http-retry.ts`'s `withRetry(fn, classify, opts)`. No inline `for` loops in feature modules.
- **Pure classifier.** The classifier takes `{ result?: T; error?: unknown; response?: { statusCode: number; headers: ... } }` and returns `"retry" | "fail" | "success"`. It never logs or sleeps — it only decides.
- **Centralized log + sleep.** `withRetry` owns the per-attempt `core.warning` + the `setTimeout` delay. Call sites stay clean.
- **Signature**:
  ```ts
  withRetry<T>(
    attempt: (attemptIndex: number) => Promise<T>,
    classify: (outcome: Outcome<T>) => Decision,
    opts?: { maxAttempts?: number; backoffMs?: readonly number[]; label?: string },
  ): Promise<T>
  ```
- **Error propagation.** On exhausted retries, `withRetry` throws an `Error` whose `.message` includes the `label` plus the joined per-attempt reasons. Call sites are free to wrap with their own context.

---

## 4. Failover

- **Cache as fallback only where safe.** Object-store cache and tool-cache hits are valid fallbacks for `404` on the release endpoint. Binary downloads behind a SHA gate **must not** failover — an unverified binary is worse than a hard fail (`github-actions.md §1 Checksum Verification`).
- **Save-cache failures degrade to `core.warning`.** A post-step cache save that fails must not fail the user's job. Wrap `saveCache` calls accordingly.
- **Main-path failures call `core.setFailed`.** Anything blocking the user's primary intent (download, extract, exec) calls `core.setFailed` with a clear message.
- **Surface partial-state.** When restoring a cache via a restore-key (not the exact key), log it. When the toolchain loads from a stale cache, log the matched key.

---

## Sources

- [Google SRE Book — Chapter 22: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [AWS Architecture Blog — Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [octokit/plugin-retry — Retry policy](https://github.com/octokit/plugin-retry.js)
- [GitHub REST API — Rate limits and `Retry-After`](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [MDN — `Retry-After` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After)
