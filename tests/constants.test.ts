import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  detectLibc,
  getArchiveCandidates,
  getDownloadUrl,
  getTarget,
  guardWindowsProcessTitle,
  uvVersionAtLeast,
} from "../src/constants.js";

describe("getTarget", () => {
  // Linux with explicit libc
  test("linux x64 gnu", () => {
    expect(getTarget({ platform: "linux", arch: "x64", libc: "gnu" })).toEqual({
      target: "x86_64-unknown-linux-gnu",
      isWindows: false,
    });
  });

  test("linux x64 musl", () => {
    expect(getTarget({ platform: "linux", arch: "x64", libc: "musl" })).toEqual({
      target: "x86_64-unknown-linux-musl",
      isWindows: false,
    });
  });

  test("linux arm64 gnu", () => {
    expect(getTarget({ platform: "linux", arch: "arm64", libc: "gnu" })).toEqual({
      target: "aarch64-unknown-linux-gnu",
      isWindows: false,
    });
  });

  test("linux arm64 musl", () => {
    expect(getTarget({ platform: "linux", arch: "arm64", libc: "musl" })).toEqual({
      target: "aarch64-unknown-linux-musl",
      isWindows: false,
    });
  });

  // macOS
  test("darwin x64", () => {
    expect(getTarget({ platform: "darwin", arch: "x64" })).toEqual({
      target: "x86_64-apple-darwin",
      isWindows: false,
    });
  });

  test("darwin arm64", () => {
    expect(getTarget({ platform: "darwin", arch: "arm64" })).toEqual({
      target: "aarch64-apple-darwin",
      isWindows: false,
    });
  });

  // Windows
  test("windows x64", () => {
    expect(getTarget({ platform: "win32", arch: "x64" })).toEqual({
      target: "x86_64-pc-windows-msvc",
      isWindows: true,
    });
  });

  test("windows arm64", () => {
    expect(getTarget({ platform: "win32", arch: "arm64" })).toEqual({
      target: "aarch64-pc-windows-msvc",
      isWindows: true,
    });
  });

  // libc is ignored on non-Linux platforms
  test("ignores libc on darwin", () => {
    expect(getTarget({ platform: "darwin", arch: "arm64", libc: "musl" })).toEqual({
      target: "aarch64-apple-darwin",
      isWindows: false,
    });
  });

  // Errors
  test("throws on unsupported platform", () => {
    expect(() => getTarget({ platform: "freebsd", arch: "x64" })).toThrow(
      "Unsupported platform: freebsd",
    );
  });

  test("throws on unsupported architecture", () => {
    expect(() => getTarget({ platform: "linux", arch: "ia32" })).toThrow(
      "Unsupported architecture: ia32",
    );
  });
});

describe("detectLibc", () => {
  test("detects musl when ld-musl linker is present", () => {
    const dir = path.join(os.tmpdir(), `test-lib-musl-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "ld-musl-x86_64.so.1"), "");
    try {
      expect(detectLibc(dir)).toBe("musl");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("detects musl for aarch64 linker", () => {
    const dir = path.join(os.tmpdir(), `test-lib-musl-arm-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "ld-musl-aarch64.so.1"), "");
    try {
      expect(detectLibc(dir)).toBe("musl");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("returns gnu when no musl linker found", () => {
    const dir = path.join(os.tmpdir(), `test-lib-gnu-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "ld-linux-x86-64.so.2"), "");
    try {
      expect(detectLibc(dir)).toBe("gnu");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("returns gnu when directory does not exist", () => {
    expect(detectLibc("/nonexistent-path-that-does-not-exist")).toBe("gnu");
  });
});

describe("uvVersionAtLeast", () => {
  test("true when patch equals the floor", () => {
    expect(uvVersionAtLeast(1, 52, 1, "1.52.1")).toBe(true);
  });

  test("true when above the floor (minor)", () => {
    expect(uvVersionAtLeast(1, 52, 1, "1.53.0")).toBe(true);
  });

  test("true when above the floor (major)", () => {
    expect(uvVersionAtLeast(1, 52, 1, "2.0.0")).toBe(true);
  });

  test("false just below the floor (patch)", () => {
    expect(uvVersionAtLeast(1, 52, 1, "1.52.0")).toBe(false);
  });

  test("false below the floor (minor)", () => {
    expect(uvVersionAtLeast(1, 52, 1, "1.51.0")).toBe(false);
  });

  test("treats empty/garbage version as 0.0.0 (below floor)", () => {
    expect(uvVersionAtLeast(1, 52, 1, "")).toBe(false);
    expect(uvVersionAtLeast(1, 52, 1, "not-a-version")).toBe(false);
  });
});

describe("guardWindowsProcessTitle", () => {
  // Save/restore the real process title so these cases don't leak.
  const original = process.title;
  afterEach(() => {
    process.title = original;
  });

  test("sets a non-empty title on Windows with affected libuv (< 1.52.1)", () => {
    process.title = "";
    guardWindowsProcessTitle("win32", "1.51.0");
    expect(process.title).toBe("setup-ocx");
  });

  test("no-op on Windows with patched libuv (>= 1.52.1)", () => {
    process.title = "sentinel";
    guardWindowsProcessTitle("win32", "1.52.1");
    expect(process.title).toBe("sentinel");
  });

  test("no-op off Windows even on affected libuv", () => {
    process.title = "sentinel";
    guardWindowsProcessTitle("linux", "1.40.0");
    expect(process.title).toBe("sentinel");
  });
});

describe("getArchiveCandidates", () => {
  test("unix prefers .tar.gz then falls back to .tar.xz", () => {
    expect(getArchiveCandidates("x86_64-unknown-linux-gnu", false)).toEqual([
      "ocx-x86_64-unknown-linux-gnu.tar.gz",
      "ocx-x86_64-unknown-linux-gnu.tar.xz",
    ]);
  });

  test("windows has a single .zip candidate", () => {
    expect(getArchiveCandidates("x86_64-pc-windows-msvc", true)).toEqual([
      "ocx-x86_64-pc-windows-msvc.zip",
    ]);
  });
});

describe("getDownloadUrl", () => {
  test("constructs correct release URL", () => {
    expect(getDownloadUrl("0.2.0", "ocx-x86_64-unknown-linux-gnu.tar.xz")).toBe(
      "https://github.com/ocx-sh/ocx/releases/download/v0.2.0/ocx-x86_64-unknown-linux-gnu.tar.xz",
    );
  });

  test("includes version prefix in URL", () => {
    const url = getDownloadUrl("1.0.0", "ocx-aarch64-apple-darwin.tar.xz");
    expect(url).toContain("/v1.0.0/");
  });
});
