import { describe, test, expect, mock, beforeEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const infoMock = mock(() => {});
const warningMock = mock(() => {});

mock.module("@actions/core", () => ({
  info: infoMock,
  debug: mock(() => {}),
  warning: warningMock,
  getInput: mock(() => ""),
  getBooleanInput: mock(() => false),
  setOutput: mock(() => {}),
  setFailed: mock(() => {}),
  addPath: mock(() => {}),
  exportVariable: mock(() => {}),
  isDebug: mock(() => false),
  saveState: mock(() => {}),
  group: mock(async (_name: string, fn: () => Promise<unknown>) => fn()),
  summary: {
    addHeading: mock(function (this: unknown) { return this; }),
    addTable: mock(function (this: unknown) { return this; }),
    write: mock(() => Promise.resolve({ filePath: "" })),
  },
}));

const isFeatureAvailableMock = mock(() => true);
const restoreCacheMock = mock(
  (_paths: string[], _key: string, _alt?: string[]) =>
    Promise.resolve(undefined as string | undefined),
);
const saveCacheMock = mock((_paths: string[], _key: string) => Promise.resolve(0));

mock.module("@actions/cache", () => ({
  isFeatureAvailable: isFeatureAvailableMock,
  restoreCache: restoreCacheMock,
  saveCache: saveCacheMock,
}));

const {
  CACHED_DIRS,
  buildCacheKey,
  restoreKeys,
  hashFile,
  restoreObjectStoreCache,
  saveObjectStoreCache,
} = await import("../src/cache");

function tempDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `test-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

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
      ocxHome: dir, lockFile: lock, ocxVersion: "0.3.1", libc: "gnu", cacheSuffix: "",
    });
    fs.writeFileSync(lock, "b");
    const k2 = buildCacheKey({
      ocxHome: dir, lockFile: lock, ocxVersion: "0.3.1", libc: "gnu", cacheSuffix: "",
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
        ocxHome: dir, lockFile: lock, ocxVersion: "0.3.1", libc: "gnu", cacheSuffix: "",
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
  beforeEach(() => {
    isFeatureAvailableMock.mockClear();
    restoreCacheMock.mockClear();
    saveCacheMock.mockClear();
    warningMock.mockClear();
    infoMock.mockClear();
    isFeatureAvailableMock.mockImplementation(() => true);
    restoreCacheMock.mockImplementation(() => Promise.resolve(undefined));
  });

  test("creates the cached dirs then calls restoreCache with the four paths", async () => {
    const dir = tempDir();
    const lock = path.join(dir, "ocx.lock");
    fs.writeFileSync(lock, "x");
    try {
      await restoreObjectStoreCache({
        ocxHome: dir, lockFile: lock, ocxVersion: "0.3.1", libc: "gnu", cacheSuffix: "",
      });
      const [paths] = restoreCacheMock.mock.calls[0];
      const names = (paths as string[]).map((p) => path.basename(p));
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
      restoreCacheMock.mockImplementation(
        async (_paths: string[], key: string) => key,
      );
      const result = await restoreObjectStoreCache({
        ocxHome: dir, lockFile: lock, ocxVersion: "0.3.1", libc: "gnu", cacheSuffix: "",
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
      restoreCacheMock.mockImplementation(
        async (_paths: string[], _key: string, alt?: string[]) => alt?.[0],
      );
      const result = await restoreObjectStoreCache({
        ocxHome: dir, lockFile: lock, ocxVersion: "0.3.1", libc: "gnu", cacheSuffix: "",
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
    isFeatureAvailableMock.mockImplementation(() => false);
    try {
      const result = await restoreObjectStoreCache({
        ocxHome: dir, lockFile: lock, ocxVersion: "0.3.1", libc: "gnu", cacheSuffix: "",
      });
      expect(result.hit).toBe(false);
      expect(restoreCacheMock).not.toHaveBeenCalled();
      expect(warningMock).toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

describe("saveObjectStoreCache", () => {
  beforeEach(() => {
    saveCacheMock.mockClear();
    warningMock.mockClear();
    isFeatureAvailableMock.mockImplementation(() => true);
  });

  test("calls saveCache with the four cached dirs", async () => {
    const dir = "/tmp/ocx-home";
    await saveObjectStoreCache(dir, "my-key");
    const [paths, key] = saveCacheMock.mock.calls[0];
    expect((paths as string[]).map((p) => path.basename(p))).toEqual([
      "blobs", "layers", "packages", "tags",
    ]);
    expect(key).toBe("my-key");
  });

  test("swallows errors into warnings", async () => {
    saveCacheMock.mockImplementation(() => Promise.reject(new Error("nope")));
    await saveObjectStoreCache("/tmp/ocx-home", "my-key");
    expect(warningMock).toHaveBeenCalled();
  });

  test("skips when cache feature unavailable", async () => {
    isFeatureAvailableMock.mockImplementation(() => false);
    await saveObjectStoreCache("/tmp/ocx-home", "my-key");
    expect(saveCacheMock).not.toHaveBeenCalled();
  });
});
