import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "node:fs";
import { resolveOcxHome, resolveWorkingDirectory } from "./project.js";
import { compareVersions } from "./version.js";

/** Minimum ocx version that supports `ocx config setup` (managed-config adoption). */
const MIN_MANAGED_CONFIG_OCX_VERSION = "0.4.3";

/**
 * Adopt or refresh the `[managed]` config tier via `ocx config setup`.
 *
 * Triggers when the `managed-config` input or the ambient `OCX_MANAGED_CONFIG`
 * env var is non-empty; otherwise a no-op (returns `false`). ocx's own
 * flag > env > seed precedence decides which ref actually gets adopted — this
 * action only decides *whether* to invoke the subcommand and whether to pass
 * an explicit `--managed-config` flag; it never reimplements that precedence.
 *
 * Runs independent of project mode (see `setup.ts` call-site ordering) —
 * managed config governs mirrors/registries for every ocx invocation on the
 * runner, so it must apply even when `project: ''` disables project
 * auto-load.
 *
 * Hard fail: `exec.exec` rejects on non-zero exit and that rejection
 * propagates uncaught here — `run()`'s top-level catch surfaces it via
 * `core.setFailed` (matches the `ocx pull` posture, see resilience.md). No
 * retry: ocx's own stderr diagnostics (exit codes 69/78/79/80/82) are already
 * visible in the log. The `ocxVersion` floor check lives behind the same
 * trigger, so a too-old ocx fails pre-flight instead of on an opaque "unknown
 * subcommand".
 */
export async function adoptManagedConfig(ocxBin: string, ocxVersion: string): Promise<boolean> {
  const managedConfigInput = core.getInput("managed-config");
  const managedConfigEnv = process.env.OCX_MANAGED_CONFIG ?? "";

  if (!managedConfigInput && !managedConfigEnv) {
    return false;
  }

  if (compareVersions(ocxVersion, MIN_MANAGED_CONFIG_OCX_VERSION) < 0) {
    throw new Error(
      `managed-config requires ocx >= ${MIN_MANAGED_CONFIG_OCX_VERSION} (config setup). ` +
        `Resolved ${ocxVersion} is too old — upgrade the version input or unset managed-config.`,
    );
  }

  const workingDirectory = resolveWorkingDirectory();
  const ocxHome = resolveOcxHome();

  core.exportVariable("OCX_HOME", ocxHome);
  fs.mkdirSync(ocxHome, { recursive: true });

  const args = ["config", "setup"];
  if (managedConfigInput) {
    args.push("--managed-config", managedConfigInput);
  }

  await core.group("ocx config setup", async () => {
    await exec.exec(ocxBin, args, { cwd: workingDirectory });
  });

  return true;
}
