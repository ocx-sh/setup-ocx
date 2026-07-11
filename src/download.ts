import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getArchiveCandidates, getDownloadUrl, getTarget } from "./constants.js";
import type { Libc } from "./constants.js";

/** True when `err` is an @actions/tool-cache download error with HTTP status 404. */
function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { httpStatusCode?: unknown }).httpStatusCode === 404;
}

export interface DownloadResult {
  binDir: string;
  version: string;
  cacheHit: boolean;
}

export interface DownloadOptions {
  cache?: boolean;
}

/**
 * Build the cache key used by the @actions/cache overlay over RUNNER_TOOL_CACHE.
 * Encodes the full Rust target triple so libc + platform + arch all participate.
 */
export function binaryCacheKey(target: string, version: string): string {
  return `setup-ocx-bin-${target}-${version}`;
}

/**
 * Path inside RUNNER_TOOL_CACHE that we snapshot for cross-run reuse.
 *
 * `@actions/tool-cache` stores the extracted archive at
 * `<root>/ocx/<version>/<arch>/` and writes a sibling marker
 * `<root>/ocx/<version>/<arch>.complete`. `tc.find()` only returns a hit
 * when the marker exists, so the cache must include the version-level
 * directory (not just the arch subdir) to round-trip both.
 */
function toolCachePath(version: string): string | null {
  const root = process.env.RUNNER_TOOL_CACHE;
  if (!root) return null;
  return path.join(root, "ocx", version);
}

export async function downloadOcx(
  version: string,
  token: string,
  libc?: Libc,
  options?: DownloadOptions,
): Promise<DownloadResult> {
  const { target, isWindows } = getTarget(libc !== undefined ? { libc } : {});
  const candidates = getArchiveCandidates(target, isWindows);
  const cacheEnabled = options?.cache ?? true;

  core.info(`Target: ${target}`);

  // 1. Fast path: intra-job tool-cache.
  const cached = tc.find("ocx", version, process.arch);
  if (cached) {
    core.info(`Found cached OCX ${version} at ${cached}`);
    const binDir = findBinDir(cached);
    return { binDir, version, cacheHit: true };
  }

  // 2. Cross-run overlay: try @actions/cache against the tool-cache dir.
  const cacheKey = binaryCacheKey(target, version);
  const cachePath = toolCachePath(version);
  const overlayAvailable = cacheEnabled && cachePath !== null && cache.isFeatureAvailable();

  if (overlayAvailable && cachePath) {
    try {
      core.info(`Restoring ocx binary cache (key=${cacheKey})...`);
      fs.mkdirSync(cachePath, { recursive: true });
      const restored = await cache.restoreCache([cachePath], cacheKey);
      if (restored) {
        const reFind = tc.find("ocx", version, process.arch);
        if (reFind) {
          core.info(`Restored ocx binary from cache (${restored})`);
          const binDir = findBinDir(reFind);
          return { binDir, version, cacheHit: true };
        }
        core.warning(
          `Cache key ${cacheKey} restored but tool-cache lookup still missed; falling through to download.`,
        );
      } else {
        core.info(`No ocx binary cache entry for key ${cacheKey}`);
      }
    } catch (err) {
      core.warning(
        `Failed to restore ocx binary cache: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3. Download + verify + extract + cache locally.
  // Try each archive format in order (new .tar.gz first, legacy .tar.xz
  // fallback); only a 404 falls through to the next candidate — any other
  // error (transient 5xx etc.) propagates.
  const auth = token ? `Bearer ${token}` : undefined;
  let archivePath: string | undefined;
  let archiveName: string | undefined;
  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i] ?? "";
    const url = getDownloadUrl(version, name);
    core.info(`Downloading OCX ${version} from ${url}`);
    try {
      archivePath = await tc.downloadTool(url, undefined, auth);
      archiveName = name;
      break;
    } catch (err) {
      if (isNotFound(err) && i < candidates.length - 1) {
        core.info(`Archive ${name} not found (404); trying next format...`);
        continue;
      }
      throw err;
    }
  }
  // Unreachable: the loop returns an archive or rethrows on the last candidate.
  if (archivePath === undefined || archiveName === undefined) {
    throw new Error(`No archive candidate resolved for OCX ${version}`);
  }

  const checksumUrl = getDownloadUrl(version, `${archiveName}.sha256`);
  core.info(`Verifying checksum from ${checksumUrl}`);

  const checksumPath = await tc.downloadTool(checksumUrl, undefined, auth);
  const checksumContent = fs.readFileSync(checksumPath, "utf8").trim();
  const expectedHash = checksumContent.split(/\s+/)[0] ?? "";
  if (!expectedHash) {
    throw new Error(`Empty checksum body fetched from ${checksumUrl}`);
  }

  const fileBuffer = fs.readFileSync(archivePath);
  const actualHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  core.debug(`SHA256 expected=${expectedHash} actual=${actualHash}`);

  if (actualHash !== expectedHash) {
    throw new Error(
      `SHA256 mismatch for ${archiveName}:\n  expected: ${expectedHash}\n  actual:   ${actualHash}`,
    );
  }
  core.info("Checksum verified");

  let extractedDir: string;
  if (isWindows) {
    extractedDir = await tc.extractZip(archivePath);
  } else {
    const flags = archiveName.endsWith(".tar.xz") ? "xJ" : "xz";
    extractedDir = await tc.extractTar(archivePath, undefined, flags);
  }

  const cachedDir = await tc.cacheDir(extractedDir, "ocx", version, process.arch);

  // 4. Defer the cross-run save to the post step.
  if (overlayAvailable && cachePath) {
    core.saveState("bin-cache-key", cacheKey);
    core.saveState("bin-cache-path", cachePath);
  }

  const binDir = findBinDir(cachedDir);
  return { binDir, version, cacheHit: false };
}

/**
 * Save the ocx binary cache from the post step. Wraps @actions/cache.saveCache
 * with warning-only error handling so a save failure never fails the user's job.
 */
export async function saveBinaryCache(cachePath: string, key: string): Promise<void> {
  try {
    core.info(`Saving ocx binary cache (key=${key})...`);
    await cache.saveCache([cachePath], key);
  } catch (err) {
    core.warning(
      `Failed to save ocx binary cache: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Finds the directory containing the ocx binary within an extracted archive.
 * cargo-dist archives have a top-level directory named like the archive.
 */
export function findBinDir(dir: string): string {
  const entries = fs.readdirSync(dir);

  for (const entry of entries) {
    const subPath = path.join(dir, entry);
    if (fs.statSync(subPath).isDirectory()) {
      const subEntries = fs.readdirSync(subPath);
      if (subEntries.some((e) => e === "ocx" || e === "ocx.exe")) {
        return subPath;
      }
    }
    if (entry === "ocx" || entry === "ocx.exe") {
      return dir;
    }
  }

  return dir;
}
