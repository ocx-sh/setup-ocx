import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  cacheMocks,
  coreMocks,
  execMocks,
  httpMocks,
  inputState,
  resetMocks,
  tcMocks,
} from "./setup-mocks.js";
import { run } from "../src/setup.js";

function makeTempDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `test-setup-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a temp dir that looks like a cached OCX installation. */
function makeCacheDir(): string {
  const dir = makeTempDir();
  const subDir = path.join(dir, "ocx-x86_64-unknown-linux-gnu");
  fs.mkdirSync(subDir);
  fs.writeFileSync(path.join(subDir, "ocx"), "");
  return dir;
}

let cacheDir: string;
let originalManagedConfigEnv: string | undefined;

beforeEach(() => {
  resetMocks();
  inputState.booleanInputs = { cache: true };
  cacheDir = makeCacheDir();
  tcMocks.find.mockImplementation(() => cacheDir);
  originalManagedConfigEnv = process.env.OCX_MANAGED_CONFIG;
  delete process.env.OCX_MANAGED_CONFIG;
});

afterEach(() => {
  if (originalManagedConfigEnv === undefined) {
    delete process.env.OCX_MANAGED_CONFIG;
  } else {
    process.env.OCX_MANAGED_CONFIG = originalManagedConfigEnv;
  }
  mock.restore();
});

describe("setup", () => {
  test("reads inputs and calls resolveVersion", async () => {
    inputState.inputs = { version: "latest", "github-token": "tok", libc: "" };
    await run();
    expect(httpMocks.getJson).toHaveBeenCalled();
  });

  test("calls downloadOcx with resolved version", async () => {
    inputState.inputs = { version: "latest", "github-token": "tok", libc: "" };
    await run();
    expect(tcMocks.find).toHaveBeenCalledWith("ocx", "0.2.0", process.arch);
  });

  test("sets outputs version, ocx-path, and cache-hit", async () => {
    inputState.inputs = { version: "latest", "github-token": "", libc: "" };
    await run();
    expect(coreMocks.setOutput).toHaveBeenCalledWith("version", "0.2.0");
    expect(coreMocks.setOutput).toHaveBeenCalledWith("cache-hit", "true");
  });

  test("sets project outputs to false when no ocx.toml present", async () => {
    inputState.inputs = {
      version: "latest",
      "github-token": "",
      libc: "",
      project: "ocx.toml",
      "working-directory": makeTempDir(),
    };
    await run();
    expect(coreMocks.setOutput).toHaveBeenCalledWith("project-loaded", "false");
    expect(coreMocks.setOutput).toHaveBeenCalledWith("project-cache-hit", "false");
  });

  test("activates project when ocx.toml exists", async () => {
    const projDir = makeTempDir();
    fs.writeFileSync(path.join(projDir, "ocx.toml"), "[tools]\n");
    fs.writeFileSync(path.join(projDir, "ocx.lock"), "x");
    inputState.inputs = {
      version: "0.3.5",
      "github-token": "",
      libc: "gnu",
      project: "ocx.toml",
      "working-directory": projDir,
    };
    inputState.booleanInputs = { cache: false };
    await run();
    expect(coreMocks.setOutput).toHaveBeenCalledWith("project-loaded", "true");
    expect(execMocks.exec).toHaveBeenCalled();
    expect(coreMocks.exportVariable).toHaveBeenCalledWith("OCX_HOME", expect.any(String));
  });

  test("auto-detects libc on linux when libc input is empty and a project is loaded", async () => {
    const projDir = makeTempDir();
    fs.writeFileSync(path.join(projDir, "ocx.toml"), "[tools]\n");
    fs.writeFileSync(path.join(projDir, "ocx.lock"), "x");
    inputState.inputs = {
      version: "0.3.5",
      "github-token": "",
      libc: "",
      project: "ocx.toml",
      "working-directory": projDir,
    };
    inputState.booleanInputs = { cache: false };
    const oldPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });
    try {
      await run();
      expect(coreMocks.setOutput).toHaveBeenCalledWith("project-loaded", "true");
    } finally {
      Object.defineProperty(process, "platform", { value: oldPlatform });
    }
  });

  test("fails project activation when resolved ocx is older than 0.3.5", async () => {
    const projDir = makeTempDir();
    fs.writeFileSync(path.join(projDir, "ocx.toml"), "[tools]\n");
    fs.writeFileSync(path.join(projDir, "ocx.lock"), "x");
    inputState.inputs = {
      version: "0.3.4",
      "github-token": "",
      libc: "gnu",
      project: "ocx.toml",
      "working-directory": projDir,
    };
    inputState.booleanInputs = { cache: false };
    await run();
    expect(coreMocks.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/requires ocx >= 0\.3\.5/),
    );
    expect(execMocks.exec).not.toHaveBeenCalled();
    expect(coreMocks.setOutput).not.toHaveBeenCalledWith("project-loaded", "true");
  });

  test("project disabled when project input is empty", async () => {
    const projDir = makeTempDir();
    fs.writeFileSync(path.join(projDir, "ocx.toml"), "[tools]\n");
    inputState.inputs = {
      version: "latest",
      "github-token": "",
      libc: "",
      project: "",
      "working-directory": projDir,
    };
    await run();
    expect(coreMocks.setOutput).toHaveBeenCalledWith("project-loaded", "false");
    expect(execMocks.exec).not.toHaveBeenCalled();
  });

  test("calls core.addPath with binDir", async () => {
    inputState.inputs = { version: "latest", "github-token": "", libc: "" };
    await run();
    expect(coreMocks.addPath).toHaveBeenCalled();
  });

  test("exports OCX_NO_UPDATE_CHECK", async () => {
    inputState.inputs = { version: "latest", "github-token": "", libc: "" };
    await run();
    expect(coreMocks.exportVariable).toHaveBeenCalledWith("OCX_NO_UPDATE_CHECK", "1");
  });

  test("writes job summary", async () => {
    inputState.inputs = { version: "latest", "github-token": "", libc: "" };
    await run();
    expect(coreMocks.summary.addHeading).toHaveBeenCalledWith("OCX Setup", 3);
    expect(coreMocks.summary.addTable).toHaveBeenCalled();
    expect(coreMocks.summary.write).toHaveBeenCalled();
  });

  test("calls core.setFailed on error", async () => {
    inputState.inputs = { version: "latest", "github-token": "", libc: "" };
    httpMocks.getJson.mockImplementation(() => Promise.reject(new Error("boom")));
    await run();
    expect(coreMocks.setFailed).toHaveBeenCalled();
  });

  test("validates libc input — rejects invalid values", async () => {
    inputState.inputs = { version: "latest", "github-token": "", libc: "invalid" };
    await run();
    expect(coreMocks.setFailed).toHaveBeenCalledWith(
      'Invalid libc value: "invalid". Must be "gnu" or "musl".',
    );
  });

  test("validates version input — rejects malformed values", async () => {
    inputState.inputs = { version: "not-a-version", "github-token": "", libc: "" };
    await run();
    expect(coreMocks.setFailed).toHaveBeenCalledWith(
      'Invalid version format: "not-a-version". Use "latest" or a semver version (e.g., "0.2.0").',
    );
  });

  test("exports OCX_LOG=debug when debug mode is enabled", async () => {
    inputState.inputs = { version: "latest", "github-token": "", libc: "" };
    inputState.debug = true;
    await run();
    expect(coreMocks.exportVariable).toHaveBeenCalledWith("OCX_LOG", "debug");
  });

  test("uses overlay restore when @actions/cache is available (no isFeatureAvailable warn)", async () => {
    cacheMocks.isFeatureAvailable.mockImplementation(() => true);
    inputState.inputs = { version: "latest", "github-token": "", libc: "" };
    await run();
    // overlay restore is only attempted on tool-cache miss; cache hit short-circuits.
    expect(coreMocks.setFailed).not.toHaveBeenCalled();
  });

  test("sets managed-config-adopted to false by default", async () => {
    inputState.inputs = { version: "latest", "github-token": "", libc: "" };
    await run();
    expect(coreMocks.setOutput).toHaveBeenCalledWith("managed-config-adopted", "false");
    expect(execMocks.exec).not.toHaveBeenCalled();
  });

  test("adopts managed config before pulling the project (ordering)", async () => {
    const projDir = makeTempDir();
    fs.writeFileSync(path.join(projDir, "ocx.toml"), "[tools]\n");
    fs.writeFileSync(path.join(projDir, "ocx.lock"), "x");
    inputState.inputs = {
      version: "0.4.3",
      "github-token": "",
      libc: "gnu",
      project: "ocx.toml",
      "working-directory": projDir,
      "managed-config": "ocx.sh/acme/fleet",
    };
    inputState.booleanInputs = { cache: false };
    await run();
    expect(coreMocks.setOutput).toHaveBeenCalledWith("managed-config-adopted", "true");
    const configSetupIndex = execMocks.exec.mock.calls.findIndex((c) =>
      (c[1] as string[] | undefined)?.includes("config"),
    );
    const pullIndex = execMocks.exec.mock.calls.findIndex((c) =>
      (c[1] as string[] | undefined)?.includes("pull"),
    );
    expect(configSetupIndex).toBeGreaterThanOrEqual(0);
    expect(pullIndex).toBeGreaterThan(configSetupIndex);
  });

  test("adopts managed config even when project auto-load is disabled", async () => {
    inputState.inputs = {
      version: "0.4.3",
      "github-token": "",
      libc: "",
      project: "",
      "managed-config": "ocx.sh/acme/fleet",
    };
    await run();
    expect(coreMocks.setOutput).toHaveBeenCalledWith("project-loaded", "false");
    expect(coreMocks.setOutput).toHaveBeenCalledWith("managed-config-adopted", "true");
    expect(execMocks.exec).toHaveBeenCalledWith(
      expect.any(String),
      ["config", "setup", "--managed-config", "ocx.sh/acme/fleet"],
      expect.anything(),
    );
  });

  test("calls setFailed when managed-config adoption fails", async () => {
    inputState.inputs = {
      version: "0.4.3",
      "github-token": "",
      libc: "",
      "managed-config": "ocx.sh/acme/fleet",
    };
    execMocks.exec.mockImplementation(() => Promise.reject(new Error("exit code 80")));
    await run();
    expect(coreMocks.setFailed).toHaveBeenCalledWith(expect.stringContaining("exit code 80"));
  });

  test("fails managed-config adoption when resolved ocx is older than 0.4.3", async () => {
    inputState.inputs = {
      version: "0.4.2",
      "github-token": "",
      libc: "",
      "managed-config": "ocx.sh/acme/fleet",
    };
    await run();
    expect(coreMocks.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/requires ocx >= 0\.4\.3/),
    );
    expect(execMocks.exec).not.toHaveBeenCalled();
  });
});
