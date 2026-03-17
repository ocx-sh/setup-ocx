import { describe, test, expect, mock, beforeEach } from "bun:test";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// --- Mocks for downloadOcx tests ---

const infoMock = mock(() => {});
mock.module("@actions/core", () => ({
  info: infoMock,
  debug: mock(() => {}),
}));

const findMock = mock(() => "");
const downloadToolMock = mock(() => Promise.resolve("/tmp/archive"));
const extractTarMock = mock(() => Promise.resolve("/tmp/extracted"));
const extractZipMock = mock(() => Promise.resolve("/tmp/extracted"));
const cacheDirMock = mock(() => Promise.resolve("/tmp/cached"));

mock.module("@actions/tool-cache", () => ({
  find: findMock,
  downloadTool: downloadToolMock,
  extractTar: extractTarMock,
  extractZip: extractZipMock,
  cacheDir: cacheDirMock,
}));

const getTargetMock = mock(() => ({ target: "x86_64-unknown-linux-gnu", isWindows: false }));

mock.module("../src/constants", () => ({
  getTarget: getTargetMock,
  getArchiveName: (target: string, isWindows: boolean) => `ocx-${target}${isWindows ? ".zip" : ".tar.xz"}`,
  getDownloadUrl: (version: string, filename: string) =>
    `https://github.com/ocx-sh/ocx/releases/download/v${version}/${filename}`,
}));

const { findBinDir, downloadOcx } = await import("../src/download");

// --- findBinDir tests (use real fs) ---

describe("findBinDir", () => {
  function makeTempDir(): string {
    const dir = path.join(os.tmpdir(), `test-findbin-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  test("finds binary in cargo-dist subdirectory", () => {
    const dir = makeTempDir();
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
    const dir = makeTempDir();
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
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "ocx"), "");
    try {
      expect(findBinDir(dir)).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("returns root when no binary found", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "README.md"), "");
    try {
      expect(findBinDir(dir)).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("handles nested directory without binary", () => {
    const dir = makeTempDir();
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

// --- downloadOcx tests (use mocked tool-cache) ---

describe("downloadOcx", () => {
  function makeTempDir(): string {
    const dir = path.join(os.tmpdir(), `test-download-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  beforeEach(() => {
    infoMock.mockClear();
    findMock.mockClear();
    downloadToolMock.mockClear();
    extractTarMock.mockClear();
    extractZipMock.mockClear();
    cacheDirMock.mockClear();
    findMock.mockImplementation(() => "");
    getTargetMock.mockImplementation(() => ({ target: "x86_64-unknown-linux-gnu", isWindows: false }));
  });

  test("returns early with cacheHit: true on cache hit", async () => {
    const cacheDir = makeTempDir();
    const subDir = path.join(cacheDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "ocx"), "");

    findMock.mockImplementation(() => cacheDir);

    try {
      const result = await downloadOcx("0.2.0", "");
      expect(result.cacheHit).toBe(true);
      expect(result.binDir).toBe(subDir);
      expect(result.version).toBe("0.2.0");
      expect(downloadToolMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(cacheDir, { recursive: true });
    }
  });

  test("downloads, verifies checksum, extracts, and caches on cache miss", async () => {
    const tmpDir = makeTempDir();
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir();
    const cachedDir = makeTempDir();

    // Create a fake archive file with known content
    const archiveContent = Buffer.from("fake-archive-content");
    fs.writeFileSync(archivePath, archiveContent);
    const expectedHash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, `${expectedHash}  ocx-x86_64-unknown-linux-gnu.tar.xz\n`);

    // Create extracted dir with ocx binary
    const subDir = path.join(extractedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "ocx"), "");

    // Same structure in cached dir
    const cachedSubDir = path.join(cachedDir, "ocx-x86_64-unknown-linux-gnu");
    fs.mkdirSync(cachedSubDir);
    fs.writeFileSync(path.join(cachedSubDir, "ocx"), "");

    let downloadCallCount = 0;
    downloadToolMock.mockImplementation(() => {
      downloadCallCount++;
      return Promise.resolve(downloadCallCount === 1 ? archivePath : checksumPath);
    });
    extractTarMock.mockImplementation(() => Promise.resolve(extractedDir));
    cacheDirMock.mockImplementation(() => Promise.resolve(cachedDir));

    try {
      const result = await downloadOcx("0.2.0", "tok");
      expect(result.cacheHit).toBe(false);
      expect(result.binDir).toBe(cachedSubDir);
      expect(downloadToolMock).toHaveBeenCalledTimes(2);
      expect(extractTarMock).toHaveBeenCalledTimes(1);
      expect(cacheDirMock).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
    }
  });

  test("throws on checksum mismatch", async () => {
    const tmpDir = makeTempDir();
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");

    fs.writeFileSync(archivePath, "fake-archive-content");
    fs.writeFileSync(checksumPath, "0000000000000000000000000000000000000000000000000000000000000000  file.tar.xz\n");

    let downloadCallCount = 0;
    downloadToolMock.mockImplementation(() => {
      downloadCallCount++;
      return Promise.resolve(downloadCallCount === 1 ? archivePath : checksumPath);
    });

    try {
      await expect(downloadOcx("0.2.0", "")).rejects.toThrow("SHA256 mismatch");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("uses extractTar with xJ flags for .tar.xz archives", async () => {
    const tmpDir = makeTempDir();
    const archivePath = path.join(tmpDir, "archive.tar.xz");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir();
    const cachedDir = makeTempDir();

    const archiveContent = Buffer.from("content");
    fs.writeFileSync(archivePath, archiveContent);
    const hash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, hash);

    fs.writeFileSync(path.join(extractedDir, "ocx"), "");
    fs.writeFileSync(path.join(cachedDir, "ocx"), "");

    let downloadCallCount = 0;
    downloadToolMock.mockImplementation(() => {
      downloadCallCount++;
      return Promise.resolve(downloadCallCount === 1 ? archivePath : checksumPath);
    });
    extractTarMock.mockImplementation(() => Promise.resolve(extractedDir));
    cacheDirMock.mockImplementation(() => Promise.resolve(cachedDir));

    try {
      await downloadOcx("0.2.0", "");
      expect(extractTarMock).toHaveBeenCalledTimes(1);
      const callArgs = extractTarMock.mock.calls[0];
      expect(callArgs[0]).toBe(archivePath);
      expect(callArgs[2]).toBe("xJ");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
    }
  });

  test("uses extractZip for Windows .zip archives", async () => {
    getTargetMock.mockImplementation(() => ({ target: "x86_64-pc-windows-msvc", isWindows: true }));

    const tmpDir = makeTempDir();
    const archivePath = path.join(tmpDir, "archive.zip");
    const checksumPath = path.join(tmpDir, "archive.sha256");
    const extractedDir = makeTempDir();
    const cachedDir = makeTempDir();

    const archiveContent = Buffer.from("content");
    fs.writeFileSync(archivePath, archiveContent);
    const hash = crypto.createHash("sha256").update(archiveContent).digest("hex");
    fs.writeFileSync(checksumPath, hash);

    fs.writeFileSync(path.join(extractedDir, "ocx.exe"), "");
    fs.writeFileSync(path.join(cachedDir, "ocx.exe"), "");

    let downloadCallCount = 0;
    downloadToolMock.mockImplementation(() => {
      downloadCallCount++;
      return Promise.resolve(downloadCallCount === 1 ? archivePath : checksumPath);
    });
    extractZipMock.mockImplementation(() => Promise.resolve(extractedDir));
    cacheDirMock.mockImplementation(() => Promise.resolve(cachedDir));

    try {
      await downloadOcx("0.2.0", "");
      expect(extractZipMock).toHaveBeenCalledTimes(1);
      expect(extractZipMock).toHaveBeenCalledWith(archivePath);
      expect(extractTarMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(extractedDir, { recursive: true });
      fs.rmSync(cachedDir, { recursive: true });
    }
  });
});
