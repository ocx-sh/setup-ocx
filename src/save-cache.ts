import * as core from "@actions/core";
import { saveObjectStoreCache } from "./cache";
import { saveBinaryCache } from "./download";

/**
 * Post-step entry point. Persists caches that the main step deferred.
 *
 * Two independent caches:
 *  - ocx binary tool-cache overlay (set by download.ts)
 *  - $OCX_HOME object store        (set by toolchain.ts)
 *
 * On the exact-key hit path the main step records `cache-hit: true`; saving
 * is a no-op (the entry already exists). On the looser restore-key path
 * (`hit: false` but `matchedKey` set) we still save, to upgrade the cache
 * to the precise key for the next run.
 *
 * Save failures degrade to warnings — they must never fail the user's job.
 */
async function run(): Promise<void> {
  // 1. Toolchain object store.
  const tcKey = core.getState("cache-key");
  const ocxHome = core.getState("ocx-home");
  const tcHit = core.getState("cache-hit") === "true";
  if (tcKey && ocxHome && !tcHit) {
    await saveObjectStoreCache(ocxHome, tcKey);
  } else if (tcHit) {
    core.info("OCX object store cache already up to date — skipping save.");
  }

  // 2. ocx binary tool-cache overlay.
  const binKey = core.getState("bin-cache-key");
  const binPath = core.getState("bin-cache-path");
  if (binKey && binPath) {
    await saveBinaryCache(binPath, binKey);
  }
}

run().catch((err) => {
  core.warning(
    `setup-ocx post step failed: ${err instanceof Error ? err.message : err}`,
  );
});
