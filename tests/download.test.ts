import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { cacheMocks, coreMocks, resetMocks, tcMocks } from "./setup-mocks.js";

// Override constants for download tests so we can drive Windows vs Linux paths
// without depending on the test host's platform. mock.module against our own
// src module is acceptable; the testing rule's prohibition is for @actions/*.
const getTargetMock = mock(() => ({ target: "x86_64-unknown-linux-gnu", isWindows: false }));
mock.module("../src/constants.js", () => ({
  getTarget: getTargetMock,
  getArchiveCandidates: (target: string, isWindows: boolean) =>
    isWindows ? [`ocx-${target}.zip`] : [`ocx-${target}.tar.gz`, `ocx-${target}.tar.xz`],
  getDownloadUrl: (version: string, filename: string) =>
    `https://github.com/ocx-sh/ocx/releases/download/v${version}/${filename}`,
  detectLibc: () => "gnu" as const,
}));

const { binaryCacheKey, downloadOcx, findBinDir, saveBinaryCache } =
  await import("../src/download.js");

function makeTempDir(prefix: string): string {
  const dir = path.join(
    os.tmpdir(),
    `${prefix}-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  resetMocks();
  getTargetMock.mockImplementation(() => ({
    target: "x86_64-unknown-linux-gnu",
    isWindows: false,
  }));
});

afterEach(() => {
  mock.restore();
});

// ─── findBinDir ───────────────────────────────────────────────────────────────
describe("findBinDir", () => {
  test("finds binary in cargo-dist subdirectory", () => {
    const dir = makeTempDir("test-findbin");
    const subDir = path.join(dir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "ocx"), "");
    try {
      expect(findBinDir(dir)).toBe(subDir);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("finds ocx.exe in cargo-dist subdirectory", () => {
    const dir = makeTempDir("test-findbin");
    const subDir = path.join(dir, "ocx-x86_64-pc-windows-msvc");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "ocx.exe"), "");
    try {
      expect(findBinDir(dir)).toBe(subDir);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("finds binary directly in root directory", () => {
    const dir = makeTempDir("test-findbin");
    fs.writeFileSync(path.join(dir, "ocx"), "");
    try {
      expect(findBinDir(dir)).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("returns root when no binary found", () => {
    const dir = makeTempDir("test-findbin");
    fs.writeFileSync(path.join(dir, "README.md"), "");
    try {
      expect(findBinDir(dir)).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("handles nested directory without binary", () => {
    const dir = makeTempDir("test-findbin");
    const subDir = path.join(dir, "some-dir");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "other-binary"), "");
    try {
      expect(findBinDir(dir)).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

describe("binaryCacheKey", () => {
  test("encodes target and version", () => {
    expect(binaryCacheKey("x86_64-unknown-linux-gnu", "0.2.0")).toBe(
      "setup-ocx-bin-x86_64-unknown-linux-gnu-0.2.0",
    );
  });
});

// ─── downloadOcx ──────────────────────────────────────────────────────────────
describe("downloadOcx", () => {
  test("returns early with cacheHit: true on tool-cache hit", async () => {
    const cacheDir = makeTempDir("test-download");
    const subDir = path.join(cacheDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "ocx"), "");
    tcMocks.find.mockImplementation(() => cacheDir);

    try {
      const result = await downloadOcx("0.2.0", "");
      expect(result.cacheHit).toBe(true);
      expect(result.binDir).toBe(subDir);
      expect(result.version).toBe("0.2.0");
      expect(tcMocks.downloadTool).not.toHaveBeenCalled();
      expect(cacheMocks.restoreCache).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(cacheDir, { recursive: true });
    }
  });

  test("@actions/cache overlay restores the tool-cache dir on cross-run hit", async () => {
    const runnerToolCache = makeTempDir("test-runner-tc");
    const oldEnv = process.env.RUNNER_TOOL_CACHE;
    process.env.RUNNER_TOOL_CACHE = runnerToolCache;
    const cachedDir = path.join(runnerToolCache, "ocx", "0.2.0", process.arch);
    const subDir = path.join(cachedDir, "ocx-x86_64-unknown-linux-gnu");

    let findCalls = 0;
    tcMocks.find.mockImplementation(() => {
      findCalls++;
      return findCalls === 1 ? "" : cachedDir;
    });

    cacheMocks.isFeatureAvailable.mockImplementation(() => true);
    cacheMocks.restoreCache.mockImplementation(() => {
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, "ocx"), "");
      return Promise.resolve("setup-ocx-bin-x86_64-unknown-linux-gnu-0.2.0");
    });

    try {
      const result = await downloadOcx("0.2.0", "", undefined, { cache: true });
      expect(result.cacheHit).toBe(true);
      expect(result.binDir).toBe(subDir);
      expect(cacheMocks.restoreCache).toHaveBeenCalledTimes(1);
      expect(tcMocks.downloadTool).not.toHaveBeenCalled();
      expect(coreMocks.saveState).not.toHaveBeenCalled();
    } finally {
      if (oldEnv === undefined) delete process.env.RUNNER_TOOL_CACHE;
      else process.env.RUNNER_TOOL_CACHE = oldEnv;
      fs.rmSync(runnerToolCache, { recursive: true });
    }
  });

  test("saves state for post step when cross-run cache misses and download runs", async () => {
    const runnerToolCache = makeTempDir("test-runner-tc");
    const oldEnv = process.env.RUNNER_TOOL_CACHE;
    process.env.RUNNER_TOOL_CACHE = runnerToolCache;

    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir("test-extracted");
    const cachedDir = makeTempDir("test-cached");

    const archiveContent = Buffer.from("content");
    fs.writeFileSync(archivePath, archiveContent);
    const hash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, hash);

    const subDir = path.join(extractedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "ocx"), "");
    const cachedSubDir = path.join(cachedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(cachedSubDir);
    fs.writeFileSync(path.join(cachedSubDir, "ocx"), "");

    let dlCount = 0;
    tcMocks.downloadTool.mockImplementation(() => {
      dlCount++;
      return Promise.resolve(dlCount === 1 ? archivePath : checksumPath);
    });
    tcMocks.extractTar.mockImplementation(() => Promise.resolve(extractedDir));
    tcMocks.cacheDir.mockImplementation(() => Promise.resolve(cachedDir));
    cacheMocks.isFeatureAvailable.mockImplementation(() => true);

    try {
      const result = await downloadOcx("0.2.0", "", undefined, { cache: true });
      expect(result.cacheHit).toBe(false);
      expect(coreMocks.saveState).toHaveBeenCalledWith(
        "bin-cache-key",
        "setup-ocx-bin-x86_64-unknown-linux-gnu-0.2.0",
      );
      expect(coreMocks.saveState).toHaveBeenCalledWith(
        "bin-cache-path",
        path.join(runnerToolCache, "ocx", "0.2.0"),
      );
    } finally {
      if (oldEnv === undefined) delete process.env.RUNNER_TOOL_CACHE;
      else process.env.RUNNER_TOOL_CACHE = oldEnv;
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
      fs.rmSync(runnerToolCache, { recursive: true });
    }
  });

  test("falls through to download when overlay restores but tool-cache still misses", async () => {
    const runnerToolCache = makeTempDir("test-runner-tc");
    const oldEnv = process.env.RUNNER_TOOL_CACHE;
    process.env.RUNNER_TOOL_CACHE = runnerToolCache;

    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir("test-extracted");
    const cachedDir = makeTempDir("test-cached");

    const archiveContent = Buffer.from("content");
    fs.writeFileSync(archivePath, archiveContent);
    const hash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, hash);

    const subDir = path.join(extractedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "ocx"), "");
    const cachedSubDir = path.join(cachedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(cachedSubDir);
    fs.writeFileSync(path.join(cachedSubDir, "ocx"), "");

    // tc.find always misses, even after overlay restore.
    tcMocks.find.mockImplementation(() => "");
    cacheMocks.isFeatureAvailable.mockImplementation(() => true);
    // restoreCache reports a hit by key, but the tool-cache marker never lands.
    cacheMocks.restoreCache.mockImplementation((_paths, key) => Promise.resolve(key as string));

    let dlCount = 0;
    tcMocks.downloadTool.mockImplementation(() => {
      dlCount++;
      return Promise.resolve(dlCount === 1 ? archivePath : checksumPath);
    });
    tcMocks.extractTar.mockImplementation(() => Promise.resolve(extractedDir));
    tcMocks.cacheDir.mockImplementation(() => Promise.resolve(cachedDir));

    try {
      const result = await downloadOcx("0.2.0", "", undefined, { cache: true });
      expect(result.cacheHit).toBe(false);
      expect(cacheMocks.restoreCache).toHaveBeenCalledTimes(1);
      expect(tcMocks.downloadTool).toHaveBeenCalledTimes(2);
      const warnings = coreMocks.warning.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(warnings.some((m: string) => m.includes("tool-cache lookup still missed"))).toBe(true);
    } finally {
      if (oldEnv === undefined) delete process.env.RUNNER_TOOL_CACHE;
      else process.env.RUNNER_TOOL_CACHE = oldEnv;
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
      fs.rmSync(runnerToolCache, { recursive: true });
    }
  });

  test("falls through to download when overlay restoreCache throws", async () => {
    const runnerToolCache = makeTempDir("test-runner-tc");
    const oldEnv = process.env.RUNNER_TOOL_CACHE;
    process.env.RUNNER_TOOL_CACHE = runnerToolCache;

    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir("test-extracted");
    const cachedDir = makeTempDir("test-cached");

    const archiveContent = Buffer.from("content");
    fs.writeFileSync(archivePath, archiveContent);
    const hash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, hash);

    const subDir = path.join(extractedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "ocx"), "");
    const cachedSubDir = path.join(cachedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(cachedSubDir);
    fs.writeFileSync(path.join(cachedSubDir, "ocx"), "");

    tcMocks.find.mockImplementation(() => "");
    cacheMocks.isFeatureAvailable.mockImplementation(() => true);
    cacheMocks.restoreCache.mockImplementation(() => Promise.reject(new Error("network blip")));

    let dlCount = 0;
    tcMocks.downloadTool.mockImplementation(() => {
      dlCount++;
      return Promise.resolve(dlCount === 1 ? archivePath : checksumPath);
    });
    tcMocks.extractTar.mockImplementation(() => Promise.resolve(extractedDir));
    tcMocks.cacheDir.mockImplementation(() => Promise.resolve(cachedDir));

    try {
      const result = await downloadOcx("0.2.0", "", undefined, { cache: true });
      expect(result.cacheHit).toBe(false);
      expect(tcMocks.downloadTool).toHaveBeenCalledTimes(2);
      const warnings = coreMocks.warning.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(
        warnings.some(
          (m: string) =>
            m.includes("Failed to restore ocx binary cache") && m.includes("network blip"),
        ),
      ).toBe(true);
    } finally {
      if (oldEnv === undefined) delete process.env.RUNNER_TOOL_CACHE;
      else process.env.RUNNER_TOOL_CACHE = oldEnv;
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
      fs.rmSync(runnerToolCache, { recursive: true });
    }
  });

  test("skips cross-run cache when cache feature unavailable", async () => {
    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir("test-extracted");
    const cachedDir = makeTempDir("test-cached");

    const archiveContent = Buffer.from("content");
    fs.writeFileSync(archivePath, archiveContent);
    const hash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, hash);

    fs.writeFileSync(path.join(extractedDir, "ocx"), "");
    fs.writeFileSync(path.join(cachedDir, "ocx"), "");

    let dlCount = 0;
    tcMocks.downloadTool.mockImplementation(() => {
      dlCount++;
      return Promise.resolve(dlCount === 1 ? archivePath : checksumPath);
    });
    tcMocks.extractTar.mockImplementation(() => Promise.resolve(extractedDir));
    tcMocks.cacheDir.mockImplementation(() => Promise.resolve(cachedDir));
    cacheMocks.isFeatureAvailable.mockImplementation(() => false);

    try {
      await downloadOcx("0.2.0", "", undefined, { cache: true });
      expect(cacheMocks.restoreCache).not.toHaveBeenCalled();
      expect(coreMocks.saveState).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
    }
  });

  test("downloads, verifies checksum, extracts, and caches on cache miss", async () => {
    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir("test-extracted");
    const cachedDir = makeTempDir("test-cached");

    const archiveContent = Buffer.from("fake-archive-content");
    fs.writeFileSync(archivePath, archiveContent);
    const expectedHash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, `${expectedHash}  ocx-x86_64-unknown-linux-gnu.tar.xz\n`);

    const subDir = path.join(extractedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "ocx"), "");

    const cachedSubDir = path.join(cachedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(cachedSubDir);
    fs.writeFileSync(path.join(cachedSubDir, "ocx"), "");

    let dlCount = 0;
    tcMocks.downloadTool.mockImplementation(() => {
      dlCount++;
      return Promise.resolve(dlCount === 1 ? archivePath : checksumPath);
    });
    tcMocks.extractTar.mockImplementation(() => Promise.resolve(extractedDir));
    tcMocks.cacheDir.mockImplementation(() => Promise.resolve(cachedDir));

    try {
      const result = await downloadOcx("0.2.0", "tok");
      expect(result.cacheHit).toBe(false);
      expect(result.binDir).toBe(cachedSubDir);
      expect(tcMocks.downloadTool).toHaveBeenCalledTimes(2);
      expect(tcMocks.extractTar).toHaveBeenCalledTimes(1);
      expect(tcMocks.cacheDir).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
    }
  });

  test("throws on checksum mismatch", async () => {
    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");

    fs.writeFileSync(archivePath, "fake-archive-content");
    fs.writeFileSync(
      checksumPath,
      "0000000000000000000000000000000000000000000000000000000000000000  file.tar.xz\n",
    );

    let dlCount = 0;
    tcMocks.downloadTool.mockImplementation(() => {
      dlCount++;
      return Promise.resolve(dlCount === 1 ? archivePath : checksumPath);
    });

    try {
      await expect(downloadOcx("0.2.0", "")).rejects.toThrow(/SHA256 mismatch/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("throws when checksum body is empty", async () => {
    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    fs.writeFileSync(archivePath, "content");
    fs.writeFileSync(checksumPath, "   \n");

    let dlCount = 0;
    tcMocks.downloadTool.mockImplementation(() => {
      dlCount++;
      return Promise.resolve(dlCount === 1 ? archivePath : checksumPath);
    });

    try {
      await expect(downloadOcx("0.2.0", "")).rejects.toThrow(/Empty checksum body/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("uses extractTar with xz flags for .tar.gz archives", async () => {
    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.tar.gz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir("test-extracted");
    const cachedDir = makeTempDir("test-cached");

    const archiveContent = Buffer.from("content");
    fs.writeFileSync(archivePath, archiveContent);
    const hash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, hash);

    fs.writeFileSync(path.join(extractedDir, "ocx"), "");
    fs.writeFileSync(path.join(cachedDir, "ocx"), "");

    let dlCount = 0;
    tcMocks.downloadTool.mockImplementation(() => {
      dlCount++;
      return Promise.resolve(dlCount === 1 ? archivePath : checksumPath);
    });
    tcMocks.extractTar.mockImplementation(() => Promise.resolve(extractedDir));
    tcMocks.cacheDir.mockImplementation(() => Promise.resolve(cachedDir));

    try {
      await downloadOcx("0.2.0", "");
      expect(tcMocks.extractTar).toHaveBeenCalledTimes(1);
      const callArgs = tcMocks.extractTar.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![0]).toBe(archivePath);
      expect(callArgs![2]).toBe("xz");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
    }
  });

  test("falls back to .tar.xz on 404 and uses xJ flags", async () => {
    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir("test-extracted");
    const cachedDir = makeTempDir("test-cached");

    const archiveContent = Buffer.from("content");
    fs.writeFileSync(archivePath, archiveContent);
    const hash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, hash);

    fs.writeFileSync(path.join(extractedDir, "ocx"), "");
    fs.writeFileSync(path.join(cachedDir, "ocx"), "");

    const urls: string[] = [];
    tcMocks.downloadTool.mockImplementation((url: string) => {
      urls.push(url);
      if (url.endsWith(".tar.gz")) {
        return Promise.reject(Object.assign(new Error("Not Found"), { httpStatusCode: 404 }));
      }
      if (url.endsWith(".tar.xz")) return Promise.resolve(archivePath);
      return Promise.resolve(checksumPath); // .sha256
    });
    tcMocks.extractTar.mockImplementation(() => Promise.resolve(extractedDir));
    tcMocks.cacheDir.mockImplementation(() => Promise.resolve(cachedDir));

    try {
      await downloadOcx("0.2.0", "");
      expect(urls.some((u) => u.endsWith(".tar.gz"))).toBe(true);
      expect(urls.some((u) => u.endsWith(".tar.xz"))).toBe(true);
      expect(tcMocks.extractTar).toHaveBeenCalledTimes(1);
      const callArgs = tcMocks.extractTar.mock.calls[0];
      expect(callArgs![0]).toBe(archivePath);
      expect(callArgs![2]).toBe("xJ");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
    }
  });

  test("does not fall back on a non-404 error", async () => {
    const urls: string[] = [];
    tcMocks.downloadTool.mockImplementation((url: string) => {
      urls.push(url);
      return Promise.reject(Object.assign(new Error("Server Error"), { httpStatusCode: 500 }));
    });

    await expect(downloadOcx("0.2.0", "")).rejects.toThrow(/Server Error/);
    expect(urls.some((u) => u.endsWith(".tar.gz"))).toBe(true);
    expect(urls.some((u) => u.endsWith(".tar.xz"))).toBe(false);
  });

  test("uses extractZip for Windows .zip archives", async () => {
    getTargetMock.mockImplementation(() => ({
      target: "x86_64-pc-windows-msvc",
      isWindows: true,
    }));

    const tmpDir = makeTempDir("test-download");
    const archivePath = path.join(tmpDir, "archive.zip");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir("test-extracted");
    const cachedDir = makeTempDir("test-cached");

    const archiveContent = Buffer.from("content");
    fs.writeFileSync(archivePath, archiveContent);
    const hash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, hash);

    fs.writeFileSync(path.join(extractedDir, "ocx.exe"), "");
    fs.writeFileSync(path.join(cachedDir, "ocx.exe"), "");

    let dlCount = 0;
    tcMocks.downloadTool.mockImplementation(() => {
      dlCount++;
      return Promise.resolve(dlCount === 1 ? archivePath : checksumPath);
    });
    tcMocks.extractZip.mockImplementation(() => Promise.resolve(extractedDir));
    tcMocks.cacheDir.mockImplementation(() => Promise.resolve(cachedDir));

    try {
      await downloadOcx("0.2.0", "");
      expect(tcMocks.extractZip).toHaveBeenCalledTimes(1);
      expect(tcMocks.extractZip).toHaveBeenCalledWith(archivePath);
      expect(tcMocks.extractTar).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
    }
  });
});

describe("saveBinaryCache", () => {
  test("delegates to @actions/cache.saveCache", async () => {
    cacheMocks.saveCache.mockImplementation(() => Promise.resolve(42));
    await saveBinaryCache("/some/path", "my-key");
    expect(cacheMocks.saveCache).toHaveBeenCalledWith(["/some/path"], "my-key");
  });

  test("swallows errors into warnings", async () => {
    cacheMocks.saveCache.mockImplementation(() => Promise.reject(new Error("boom")));
    await saveBinaryCache("/some/path", "my-key");
    expect(coreMocks.warning).toHaveBeenCalled();
  });
});
