import * as core from "@actions/core";
import * as path from "node:path";
import { detectLibc, guardWindowsProcessTitle } from "./constants.js";
import type { Libc } from "./constants.js";
import { downloadOcx } from "./download.js";
import { loadProject, readProjectInputs } from "./project.js";
import { resolveVersion } from "./version.js";

/** Minimum ocx version that supports `ocx env --ci=github` (project activation). */
const MIN_PROJECT_OCX_VERSION = "0.3.5";

/**
 * Compare two dotted numeric versions (optional leading `v`).
 * Returns <0 if a<b, 0 if equal, >0 if a>b. Non-numeric / missing segments
 * are treated as 0, so pre-release suffixes are ignored for the floor check.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((s) => Number.parseInt(s, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function run(): Promise<void> {
  try {
    // Preempt the libuv `process_title` abort on affected Windows runtimes
    // before any console-title read can crash the process. No-op elsewhere.
    guardWindowsProcessTitle();

    const versionInput = core.getInput("version");
    const token = core.getInput("github-token");
    const libcInput = core.getInput("libc");
    const cacheInput = core.getBooleanInput("cache");

    core.debug(`Inputs: version="${versionInput}", libc="${libcInput || "(auto)"}"`);

    // Validate libc
    if (libcInput && libcInput !== "gnu" && libcInput !== "musl") {
      throw new Error(`Invalid libc value: "${libcInput}". Must be "gnu" or "musl".`);
    }
    const libc: Libc | undefined = libcInput ? (libcInput as Libc) : undefined;

    // Validate version
    if (versionInput !== "latest" && !/^v?\d+\.\d+\.\d+/.test(versionInput)) {
      throw new Error(
        `Invalid version format: "${versionInput}". Use "latest" or a semver version (e.g., "0.2.0").`,
      );
    }

    const version = await resolveVersion(versionInput, token);
    const {
      binDir,
      version: installedVersion,
      cacheHit,
    } = await downloadOcx(version, token, libc, { cache: cacheInput });

    core.addPath(binDir);
    core.exportVariable("OCX_NO_UPDATE_CHECK", "1");

    if (core.isDebug()) {
      core.exportVariable("OCX_LOG", "debug");
    }

    core.setOutput("version", installedVersion);
    core.setOutput("ocx-path", binDir);
    core.setOutput("cache-hit", cacheHit.toString());

    // Phase 2: project activation (auto-loads when ocx.toml exists).
    const projectInputs = readProjectInputs();
    let projectLoaded = false;
    let projectCacheHit = false;

    if (projectInputs) {
      if (compareVersions(installedVersion, MIN_PROJECT_OCX_VERSION) < 0) {
        throw new Error(
          `Project activation requires ocx >= ${MIN_PROJECT_OCX_VERSION} (env --ci). ` +
            `Resolved ${installedVersion} is too old — upgrade the version input or set project: ''.`,
        );
      }
      const ocxBin = path.join(binDir, process.platform === "win32" ? "ocx.exe" : "ocx");
      const result = await loadProject({
        ocxBin,
        ocxVersion: installedVersion,
        libc: libc ?? (process.platform === "linux" ? detectLibc() : ""),
        inputs: projectInputs,
      });
      projectLoaded = true;
      projectCacheHit = result.cacheHit;
    }

    core.setOutput("project-loaded", projectLoaded ? "true" : "false");
    core.setOutput("project-cache-hit", projectCacheHit ? "true" : "false");

    await core.summary
      .addHeading("OCX Setup", 3)
      .addTable([
        [
          { data: "Version", header: true },
          { data: "Path", header: true },
          { data: "Cache", header: true },
          { data: "Project", header: true },
        ],
        [
          installedVersion,
          binDir,
          cacheHit ? "Hit" : "Miss",
          projectLoaded ? (projectCacheHit ? "Loaded (cache hit)" : "Loaded") : "—",
        ],
      ])
      .write();

    core.info(
      `OCX ${installedVersion} is ready (${binDir})${cacheHit ? " [cached]" : ""}` +
        (projectLoaded ? ` — project activated${projectCacheHit ? " [store cache hit]" : ""}` : ""),
    );
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
}

void run();
