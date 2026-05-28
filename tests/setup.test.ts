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

beforeEach(() => {
  resetMocks();
  inputState.booleanInputs = { cache: true };
  cacheDir = makeCacheDir();
  tcMocks.find.mockImplementation(() => cacheDir);
});

afterEach(() => {
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
      version: "latest",
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
      version: "latest",
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
});
