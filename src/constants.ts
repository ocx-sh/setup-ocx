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

export function getArchiveName(target: string, isWindows: boolean): string {
  const ext = isWindows ? ".zip" : ".tar.xz";
  return `ocx-${target}${ext}`;
}

export function getDownloadUrl(version: string, filename: string): string {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${version}/${filename}`;
}
