import * as core from "@actions/core";
import * as path from "node:path";
import { detectLibc } from "./constants.js";
import type { Libc } from "./constants.js";
import { downloadOcx } from "./download.js";
import { loadToolchain, readToolchainInputs } from "./toolchain.js";
import { resolveVersion } from "./version.js";

export async function run(): Promise<void> {
  try {
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

    // Phase 2: project toolchain activation (auto-loads when ocx.toml exists).
    const tcInputs = readToolchainInputs();
    let toolchainLoaded = false;
    let toolchainCacheHit = false;

    if (tcInputs) {
      const ocxBin = path.join(binDir, process.platform === "win32" ? "ocx.exe" : "ocx");
      const result = await loadToolchain({
        ocxBin,
        ocxVersion: installedVersion,
        libc: libc ?? (process.platform === "linux" ? detectLibc() : ""),
        inputs: tcInputs,
      });
      toolchainLoaded = true;
      toolchainCacheHit = result.cacheHit;
    }

    core.setOutput("toolchain-loaded", toolchainLoaded ? "true" : "false");
    core.setOutput("toolchain-cache-hit", toolchainCacheHit ? "true" : "false");

    await core.summary
      .addHeading("OCX Setup", 3)
      .addTable([
        [
          { data: "Version", header: true },
          { data: "Path", header: true },
          { data: "Cache", header: true },
          { data: "Toolchain", header: true },
        ],
        [
          installedVersion,
          binDir,
          cacheHit ? "Hit" : "Miss",
          toolchainLoaded ? (toolchainCacheHit ? "Loaded (cache hit)" : "Loaded") : "—",
        ],
      ])
      .write();

    core.info(
      `OCX ${installedVersion} is ready (${binDir})${cacheHit ? " [cached]" : ""}` +
        (toolchainLoaded
          ? ` — toolchain activated${toolchainCacheHit ? " [store cache hit]" : ""}`
          : ""),
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
