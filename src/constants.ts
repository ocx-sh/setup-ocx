import * as fs from "node:fs";

export const REPO_OWNER = "ocx-sh";
export const REPO_NAME = "ocx";

export type Libc = "gnu" | "musl";

/** Maps Node.js process.arch to Rust target arch prefix. */
const ARCH_MAP: Record<string, string> = {
  x64: "x86_64",
  arm64: "aarch64",
};

/**
 * Detects whether the current Linux system uses musl or glibc.
 * Checks for the musl dynamic linker in the given lib directory.
 */
export function detectLibc(libDir = "/lib"): Libc {
  try {
    const entries = fs.readdirSync(libDir);
    if (entries.some((e) => e.startsWith("ld-musl"))) {
      return "musl";
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return "gnu";
}

export function getTarget(options?: { platform?: string; arch?: string; libc?: Libc }): {
  target: string;
  isWindows: boolean;
} {
  const platform = options?.platform ?? process.platform;
  const arch = options?.arch ?? process.arch;

  const archStr = ARCH_MAP[arch];
  if (!archStr) {
    throw new Error(`Unsupported architecture: ${arch}`);
  }

  const isWindows = platform === "win32";

  let os: string;
  switch (platform) {
    case "linux": {
      const libcVariant = options?.libc ?? detectLibc();
      os = `unknown-linux-${libcVariant}`;
      break;
    }
    case "darwin":
      os = "apple-darwin";
      break;
    case "win32":
      os = "pc-windows-msvc";
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  return { target: `${archStr}-${os}`, isWindows };
}

/**
 * Compares the running libuv version (`process.versions.uv`, e.g. `"1.51.0"`)
 * against a `major.minor.patch` floor. Missing or non-numeric segments are
 * treated as 0, so an unparsable version string reads as `0.0.0` (always below
 * the floor) — the safe default for the gate below.
 */
export function uvVersionAtLeast(
  major: number,
  minor: number,
  patch: number,
  uv: string = process.versions.uv,
): boolean {
  const parts = uv.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const got: [number, number, number] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  const want: [number, number, number] = [major, minor, patch];
  for (let i = 0; i < 3; i++) {
    if (got[i] !== want[i]) return got[i] > want[i];
  }
  return true;
}

/**
 * Works around a libuv abort on Windows that can crash any short-lived Node
 * process — including this action's post step — with:
 *
 *     Assertion failed: process_title, file src\win\util.c, line 412
 *
 * Root cause: on Windows, `uv_get_process_title` reads the console title via
 * `GetConsoleTitle`, which returns `0` for BOTH an error AND an empty title.
 * libuv < 1.52.1 conflates the two, leaves its cached `process_title` NULL, and
 * the next read trips `assert(process_title)` → `abort()`. A fresh CI console
 * often has an empty title, so the post step inherits the bad state. The abort
 * is C-level and fires *inside the getter*, so it cannot be caught from JS, nor
 * can `process.title` be read to probe — the read is the crash.
 *
 * The setter (`uv_set_process_title`) has no assert. Setting a NON-EMPTY title
 * populates libuv's cache, so the later getter returns the cached value instead
 * of re-querying the empty console title. Idempotent and safe: it never
 * re-introduces the empty-title state, and helps later steps too.
 *
 * Gated tightly — Windows only, and only on the affected libuv versions — so it
 * is a complete no-op once GitHub ships a runtime with the upstream fix.
 *
 * @see https://github.com/libuv/libuv/pull/4807 (fixed in libuv 1.52.1)
 * @see https://github.com/nodejs/node/issues/58695
 * @see https://github.com/libuv/libuv/issues/2667
 */
export function guardWindowsProcessTitle(
  platform: string = process.platform,
  uv: string = process.versions.uv,
): void {
  if (platform !== "win32") return;
  if (uvVersionAtLeast(1, 52, 1, uv)) return;
  try {
    process.title = "setup-ocx";
  } catch {
    // Non-fatal: if SetConsoleTitleW fails we are no worse off than before.
  }
}

export function getArchiveName(target: string, isWindows: boolean): string {
  const ext = isWindows ? ".zip" : ".tar.xz";
  return `ocx-${target}${ext}`;
}

export function getDownloadUrl(version: string, filename: string): string {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${version}/${filename}`;
}
