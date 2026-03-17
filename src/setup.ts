import * as core from "@actions/core";
import type { Libc } from "./constants";
import { downloadOcx } from "./download";
import { resolveVersion } from "./version";

export async function run(): Promise<void> {
  try {
    const versionInput = core.getInput("version");
    const token = core.getInput("github-token");
    const libcInput = core.getInput("libc");

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
    const { binDir, version: installedVersion, cacheHit } = await downloadOcx(version, token, libc);

    core.addPath(binDir);
    core.exportVariable("OCX_NO_UPDATE_CHECK", "1");

    if (core.isDebug()) {
      core.exportVariable("OCX_LOG", "debug");
    }

    core.setOutput("version", installedVersion);
    core.setOutput("ocx-path", binDir);
    core.setOutput("cache-hit", cacheHit.toString());

    await core.summary
      .addHeading("OCX Setup", 3)
      .addTable([
        [
          { data: "Version", header: true },
          { data: "Path", header: true },
          { data: "Cache", header: true },
        ],
        [installedVersion, binDir, cacheHit ? "Hit" : "Miss"],
      ])
      .write();

    core.info(`OCX ${installedVersion} is ready (${binDir})${cacheHit ? " [cached]" : ""}`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
}

run();
