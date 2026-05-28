import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { cacheMocks, coreMocks, resetMocks } from "./setup-mocks.js";
import {
  CACHED_DIRS,
  buildCacheKey,
  hashFile,
  restoreKeys,
  restoreObjectStoreCache,
  saveObjectStoreCache,
} from "../src/cache.js";

function tempDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `test-cache-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  resetMocks();
  cacheMocks.isFeatureAvailable.mockImplementation(() => true);
});

afterEach(() => {
  mock.restore();
});

describe("CACHED_DIRS", () => {
  test("caches the four CAS-flavored dirs and nothing else", () => {
    expect([...CACHED_DIRS]).toEqual(["blobs", "layers", "packages", "tags"]);
  });
});

describe("hashFile", () => {
  test("returns sha256 hex digest of file content", () => {
    const dir = tempDir();
    const file = path.join(dir, "lock");
    fs.writeFileSync(file, "lock-content");
    try {
      const h = hashFile(file);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("returns sentinel when file missing", () => {
    expect(hashFile("/nonexistent/lock")).toBe("nolock");
  });
});

describe("buildCacheKey", () => {
  test("includes platform, arch, libc, ocx version and lock hash", () => {
    const dir = tempDir();
    const lock = path.join(dir, "ocx.lock");
    fs.writeFileSync(lock, "lock-bytes");
    try {
      const key = buildCacheKey({
        ocxHome: dir,
        lockFile: lock,
        ocxVersion: "0.3.1",
        libc: "gnu",
        cacheSuffix: "",
      });
      expect(key).toContain(`setup-ocx-store-${process.platform}-${process.arch}-gnu-ocx0.3.1-`);
      expect(key).toMatch(/[0-9a-f]{16}$/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("appends cache-suffix when provided", () => {
    const dir = tempDir();
    const lock = path.join(dir, "ocx.lock");
    fs.writeFileSync(lock, "x");
    try {
      const key = buildCacheKey({
        ocxHome: dir,
        lockFile: lock,
        ocxVersion: "0.3.1",
        libc: "gnu",
        cacheSuffix: "feature-x",
      });
      expect(key.endsWith("-feature-x")).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("different lock content yields different key", () => {
    const dir = tempDir();
    const lock = path.join(dir, "ocx.lock");
    fs.writeFileSync(lock, "a");
    const k1 = buildCacheKey({
      ocxHome: dir,
      lockFile: lock,
      ocxVersion: "0.3.1",
      libc: "gnu",
      cacheSuffix: "",
    });
    fs.writeFileSync(lock, "b");
    const k2 = buildCacheKey({
      ocxHome: dir,
      lockFile: lock,
      ocxVersion: "0.3.1",
      libc: "gnu",
      cacheSuffix: "",
    });
    fs.rmSync(dir, { recursive: true });
    expect(k1).not.toBe(k2);
  });
});

describe("restoreKeys", () => {
  test("includes a looser key without lock hash for partial reuse", () => {
    const dir = tempDir();
    const lock = path.join(dir, "ocx.lock");
    fs.writeFileSync(lock, "x");
    try {
      const fallbacks = restoreKeys({
        ocxHome: dir,
        lockFile: lock,
        ocxVersion: "0.3.1",
        libc: "gnu",
        cacheSuffix: "",
      });
      expect(fallbacks.length).toBeGreaterThan(0);
      expect(fallbacks[fallbacks.length - 1]).toBe(
        `setup-ocx-store-${process.platform}-${process.arch}-gnu-`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

describe("restoreObjectStoreCache", () => {
  test("creates the cached dirs then calls restoreCache with the four paths", async () => {
    const dir = tempDir();
    const lock = path.join(dir, "ocx.lock");
    fs.writeFileSync(lock, "x");
    try {
      await restoreObjectStoreCache({
        ocxHome: dir,
        lockFile: lock,
        ocxVersion: "0.3.1",
        libc: "gnu",
        cacheSuffix: "",
      });
      const call = cacheMocks.restoreCache.mock.calls[0];
      expect(call).toBeDefined();
      const paths = call![0];
      const names = paths.map((p: string) => path.basename(p));
      expect(names).toEqual(["blobs", "layers", "packages", "tags"]);
      for (const sub of ["blobs", "layers", "packages", "tags"]) {
        expect(fs.existsSync(path.join(dir, sub))).toBe(true);
      }
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("hit=true when restoreCache returns the exact key", async () => {
    const dir = tempDir();
    const lock = path.join(dir, "ocx.lock");
    fs.writeFileSync(lock, "x");
    try {
      cacheMocks.restoreCache.mockImplementation(async (_paths, key) => Promise.resolve(key));
      const result = await restoreObjectStoreCache({
        ocxHome: dir,
        lockFile: lock,
        ocxVersion: "0.3.1",
        libc: "gnu",
        cacheSuffix: "",
      });
      expect(result.hit).toBe(true);
      expect(result.matchedKey).toBe(result.key);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("hit=false when a restore-key (not the exact key) matches", async () => {
    const dir = tempDir();
    const lock = path.join(dir, "ocx.lock");
    fs.writeFileSync(lock, "x");
    try {
      cacheMocks.restoreCache.mockImplementation(async (_paths, _key, alt) =>
        Promise.resolve(alt?.[0]),
      );
      const result = await restoreObjectStoreCache({
        ocxHome: dir,
        lockFile: lock,
        ocxVersion: "0.3.1",
        libc: "gnu",
        cacheSuffix: "",
      });
      expect(result.hit).toBe(false);
      expect(result.matchedKey).toBeDefined();
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("returns hit=false and warns when cache feature unavailable", async () => {
    const dir = tempDir();
    const lock = path.join(dir, "ocx.lock");
    fs.writeFileSync(lock, "x");
    cacheMocks.isFeatureAvailable.mockImplementation(() => false);
    try {
      const result = await restoreObjectStoreCache({
        ocxHome: dir,
        lockFile: lock,
        ocxVersion: "0.3.1",
        libc: "gnu",
        cacheSuffix: "",
      });
      expect(result.hit).toBe(false);
      expect(cacheMocks.restoreCache).not.toHaveBeenCalled();
      expect(coreMocks.warning).toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

describe("saveObjectStoreCache", () => {
  test("calls saveCache with the four cached dirs", async () => {
    const dir = "/tmp/ocx-home";
    await saveObjectStoreCache(dir, "my-key");
    const call = cacheMocks.saveCache.mock.calls[0];
    expect(call).toBeDefined();
    const [paths, key] = call!;
    expect(paths.map((p: string) => path.basename(p))).toEqual([
      "blobs",
      "layers",
      "packages",
      "tags",
    ]);
    expect(key).toBe("my-key");
  });

  test("swallows errors into warnings", async () => {
    cacheMocks.saveCache.mockImplementation(() => Promise.reject(new Error("nope")));
    await saveObjectStoreCache("/tmp/ocx-home", "my-key");
    expect(coreMocks.warning).toHaveBeenCalled();
  });

  test("skips when cache feature unavailable", async () => {
    cacheMocks.isFeatureAvailable.mockImplementation(() => false);
    await saveObjectStoreCache("/tmp/ocx-home", "my-key");
    expect(cacheMocks.saveCache).not.toHaveBeenCalled();
  });
});
