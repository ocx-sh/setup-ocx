import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildCacheKey, restoreObjectStoreCache } from "./cache.js";
import type { ObjectStoreCacheConfig } from "./cache.js";

export interface ProjectInputs {
  workingDirectory: string;
  projectFile: string; // absolute path to ocx.toml
  lockFile: string; // absolute path to ocx.lock
  groups: string[]; // [] = pass no -g
  ocxHome: string; // resolved absolute
  cacheEnabled: boolean;
  cacheSuffix: string;
}

export interface LoadProjectArgs {
  ocxBin: string; // absolute path to the ocx executable
  ocxVersion: string;
  libc: string; // "gnu" | "musl" | "" for non-linux
  inputs: ProjectInputs;
}

export interface LoadProjectResult {
  cacheKey: string;
  cacheHit: boolean;
}

/**
 * Directory every `ocx` invocation runs in. Shared by project activation and
 * managed-config adoption — both must resolve it identically.
 */
export function resolveWorkingDirectory(): string {
  return core.getInput("working-directory") || (process.env.GITHUB_WORKSPACE ?? process.cwd());
}

/**
 * Absolute `$OCX_HOME`. Shared by project activation and managed-config
 * adoption — a divergence would export one home and pull into another.
 */
export function resolveOcxHome(): string {
  const ocxHomeInput = core.getInput("ocx-home");
  return ocxHomeInput ? path.resolve(ocxHomeInput) : path.join(os.homedir(), ".ocx");
}

/**
 * Parse action inputs into a normalized project configuration.
 *
 * Returns null when the project file does not exist — the action then
 * silently falls back to binary-only mode, which is the auto-load opt-out.
 */
export function readProjectInputs(): ProjectInputs | null {
  const rawProject = core.getInput("project");
  if (!rawProject) {
    // Explicit opt-out: user set `project: ''`.
    return null;
  }

  const workingDirectory = resolveWorkingDirectory();

  const projectFile = path.isAbsolute(rawProject)
    ? rawProject
    : path.join(workingDirectory, rawProject);

  if (!fs.existsSync(projectFile)) {
    core.info(`No project at ${projectFile} — skipping project activation.`);
    return null;
  }

  const lockFile = path.join(path.dirname(projectFile), "ocx.lock");
  if (!fs.existsSync(lockFile)) {
    core.warning(
      `Found ${projectFile} but no ocx.lock alongside it — \`ocx pull\` will fail. Run \`ocx lock\` locally and commit the result.`,
    );
  }

  const groups = core
    .getInput("groups")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  const cacheEnabled = core.getBooleanInput("cache");
  const cacheSuffix = core.getInput("cache-suffix");

  return {
    ocxHome: resolveOcxHome(),
    workingDirectory,
    projectFile,
    lockFile,
    groups,
    cacheEnabled,
    cacheSuffix,
  };
}

/**
 * Activate the project toolchain:
 *   1. export OCX_HOME (overrides ~/.ocx so cache + future steps line up)
 *   2. optionally restore object store cache
 *   3. `ocx --project <file> pull [-g ...]` — populate the store
 *   4. `ocx --project <file> env --ci=github` — append toolchain env to
 *      $GITHUB_PATH / $GITHUB_ENV (ocx owns the format; requires ocx >= 0.3.5)
 *   5. saveState for the post step
 */
export async function loadProject(args: LoadProjectArgs): Promise<LoadProjectResult> {
  const { ocxBin, ocxVersion, libc, inputs } = args;

  core.exportVariable("OCX_HOME", inputs.ocxHome);
  fs.mkdirSync(inputs.ocxHome, { recursive: true });

  const cacheCfg: ObjectStoreCacheConfig = {
    ocxHome: inputs.ocxHome,
    lockFile: inputs.lockFile,
    ocxVersion,
    libc: libc || "na",
    cacheSuffix: inputs.cacheSuffix,
  };

  let cacheKey = buildCacheKey(cacheCfg);
  let cacheHit = false;

  if (inputs.cacheEnabled) {
    const restored = await restoreObjectStoreCache(cacheCfg);
    cacheKey = restored.key;
    cacheHit = restored.hit;
  }

  await core.group("ocx pull", async () => {
    const pullArgs = ["--project", inputs.projectFile, "pull"];
    if (inputs.groups.length > 0) {
      pullArgs.push("-g", inputs.groups.join(","));
    }
    await exec.exec(ocxBin, pullArgs, { cwd: inputs.workingDirectory });
  });

  await core.group("ocx env", async () => {
    // `--ci=github` makes ocx append tool dirs + vars straight to
    // $GITHUB_PATH / $GITHUB_ENV — the same channel core.addPath /
    // core.exportVariable write to. Explicit `=github` avoids ocx's
    // provider autodetect (exit 64) and is OS-agnostic.
    await exec.exec(ocxBin, ["--project", inputs.projectFile, "env", "--ci=github"], {
      cwd: inputs.workingDirectory,
    });
  });

  // Hand off to the post step.
  if (inputs.cacheEnabled) {
    core.saveState("cache-key", cacheKey);
    core.saveState("ocx-home", inputs.ocxHome);
    core.saveState("cache-hit", cacheHit ? "true" : "false");
  }

  return { cacheKey, cacheHit };
}
