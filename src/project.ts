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

  const workingDirectory =
    core.getInput("working-directory") || (process.env.GITHUB_WORKSPACE ?? process.cwd());

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

  const ocxHomeInput = core.getInput("ocx-home");
  const ocxHome = ocxHomeInput ? path.resolve(ocxHomeInput) : path.join(os.homedir(), ".ocx");

  return {
    workingDirectory,
    projectFile,
    lockFile,
    groups,
    ocxHome,
    cacheEnabled,
    cacheSuffix,
  };
}

/**
 * Activate the project toolchain:
 *   1. export OCX_HOME (overrides ~/.ocx so cache + future steps line up)
 *   2. optionally restore object store cache
 *   3. `ocx --project <file> pull [-g ...]` — populate the store
 *   4. `ocx --project <file> env --shell=bash|powershell` — apply env
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
    const shellArg = process.platform === "win32" ? "powershell" : "bash";
    let envOutput = "";
    await exec.exec(ocxBin, ["--project", inputs.projectFile, "env", `--shell=${shellArg}`], {
      cwd: inputs.workingDirectory,
      listeners: {
        stdout: (data) => {
          envOutput += data.toString();
        },
      },
    });
    applyShellExports(envOutput, shellArg);
  });

  // Hand off to the post step.
  if (inputs.cacheEnabled) {
    core.saveState("cache-key", cacheKey);
    core.saveState("ocx-home", inputs.ocxHome);
    core.saveState("cache-hit", cacheHit ? "true" : "false");
  }

  return { cacheKey, cacheHit };
}

/**
 * Parse the output of `ocx env --shell=<bash|powershell>` and translate it
 * into GitHub Actions env mutations.
 *
 * bash form:    `export PATH="X:${PATH}"` or `export FOO="bar"`
 * powershell:   `$env:PATH = "X;$env:PATH"` or `$env:FOO = "bar"`
 *
 * PATH-style assignments (prepending to an existing PATH value) are split
 * into individual entries and pushed via core.addPath so they survive into
 * later steps. Plain assignments go through core.exportVariable.
 */
export function applyShellExports(text: string, shell: "bash" | "powershell"): void {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (shell === "bash") {
      const m = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!m?.[1] || m[2] === undefined) continue;
      const name = m[1];
      const value = unquoteBash(m[2]);
      applyAssignment(name, value, /[:]\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/);
    } else {
      const m = /^\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
      if (!m?.[1] || m[2] === undefined) continue;
      const name = m[1];
      const value = unquotePs(m[2]);
      applyAssignment(name, value, /;\$env:[A-Za-z_][A-Za-z0-9_]*$/);
    }
  }
}

function applyAssignment(name: string, value: string, prependTail: RegExp): void {
  const tailMatch = prependTail.exec(value);
  if (name === "PATH" && tailMatch) {
    // Strip the trailing `:${PATH}` (or `;$env:PATH`) and push remaining entries.
    const prefix = value.slice(0, tailMatch.index);
    const sep = process.platform === "win32" ? ";" : ":";
    for (const entry of prefix.split(sep)) {
      if (entry) core.addPath(entry);
    }
  } else {
    core.exportVariable(name, value);
  }
}

function unquoteBash(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  else if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  return s.replace(/\\(.)/g, "$1");
}

function unquotePs(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  else if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  return s;
}
