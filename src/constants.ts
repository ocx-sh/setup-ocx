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
    const g = got[i] ?? 0;
    const w = want[i] ?? 0;
    if (g !== w) return g > w;
  }
  return true;
}

/**
 * Works around a libuv abort on Windows that can crash any short-lived Node
 * process — including this action's post step — with:
 *
 *     Assertion failed: process_title, file src\win\util.c, line 412
 *
 * Root cause: on Windows, `uv_get_process_title` lazily reads the console title
 * via `GetConsoleTitleW`. When a console IS attached but its title is EMPTY,
 * `GetConsoleTitleW` returns length `0` and `GetLastError()` is `0`, so libuv's
 * `uv_translate_sys_error(0)` yields success (`0`) while leaving its cached
 * `process_title` NULL. Control then falls through to `assert(process_title)`
 * → `abort()`. (With NO console attached, `GetLastError()` is non-zero, libuv
 * returns a real error, and there is no abort — the crash needs the precise
 * "console present, title empty" state a fresh CI console can have.)
 *
 * The setter (`uv_set_process_title`) calls `SetConsoleTitleW`, which SUCCEEDS
 * whenever a console is attached — exactly the state that triggers the abort —
 * and only then assigns `process_title`. So setting a non-empty title populates
 * libuv's cache; every later getter returns the cached value and never re-reads
 * the empty console title. Idempotent and safe.
 *
 * Timing is critical: the first crashing getter can fire during MODULE
 * EVALUATION of a bundled `@actions/*` dependency, before any entry-point
 * `run()` body executes. The guard is therefore invoked from `win-title-guard.ts`,
 * a side-effect import placed ahead of all `@actions/*` imports — not from
 * inside `run()`, which is already too late.
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
