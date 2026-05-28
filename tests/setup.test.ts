import { describe, test, expect, mock, beforeEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// --- Mock external dependencies only (no source module mocks) ---

const infoMock = mock(() => {});
const setFailedMock = mock(() => {});
const setOutputMock = mock(() => {});
const addPathMock = mock(() => {});
const exportVariableMock = mock(() => {});
const isDebugMock = mock(() => false);
const saveStateMock = mock(() => {});
const summaryWriteMock = mock(() => Promise.resolve({ filePath: "" }));
const summaryObj = {
  addHeading: mock(function (this: typeof summaryObj) {
    return this;
  }),
  addTable: mock(function (this: typeof summaryObj) {
    return this;
  }),
  write: summaryWriteMock,
};

let getInputValues: Record<string, string> = {};
let getBooleanInputValues: Record<string, boolean> = {};

const groupMock = mock(async (_name: string, fn: () => Promise<unknown>) => {
  return fn();
});

mock.module("@actions/core", () => ({
  info: infoMock,
  debug: mock(() => {}),
  warning: mock(() => {}),
  getInput: mock((name: string) => getInputValues[name] ?? ""),
  getBooleanInput: mock((name: string) => getBooleanInputValues[name] ?? false),
  setOutput: setOutputMock,
  setFailed: setFailedMock,
  addPath: addPathMock,
  exportVariable: exportVariableMock,
  isDebug: isDebugMock,
  saveState: saveStateMock,
  group: groupMock,
  summary: summaryObj,
}));

const getJsonMock = mock(() =>
  Promise.resolve({
    statusCode: 200,
    result: { tag_name: "v0.2.0" },
    headers: {},
  }),
);

mock.module("@actions/http-client", () => ({
  HttpClient: class MockHttpClient {
    getJson = getJsonMock;
  },
}));

const findMock = mock(() => "");
const downloadToolMock = mock(() => Promise.resolve("/tmp/mock"));
const extractTarMock = mock(() => Promise.resolve("/tmp/mock"));
const extractZipMock = mock(() => Promise.resolve("/tmp/mock"));
const cacheDirMock = mock(() => Promise.resolve("/tmp/mock"));

mock.module("@actions/tool-cache", () => ({
  find: findMock,
  downloadTool: downloadToolMock,
  extractTar: extractTarMock,
  extractZip: extractZipMock,
  cacheDir: cacheDirMock,
}));

const isFeatureAvailableMock = mock(() => false);
const restoreCacheMock = mock(() => Promise.resolve(undefined as string | undefined));
const saveCacheMock = mock(() => Promise.resolve(0));

mock.module("@actions/cache", () => ({
  isFeatureAvailable: isFeatureAvailableMock,
  restoreCache: restoreCacheMock,
  saveCache: saveCacheMock,
}));

const execMock = mock(
  async (_bin: string, _args: string[], options?: {
    listeners?: { stdout?: (data: Buffer) => void };
  }) => {
    if (options?.listeners?.stdout) {
      options.listeners.stdout(Buffer.from('export PATH="/opt/bun/bin:${PATH}"\n'));
    }
    return 0;
  },
);

mock.module("@actions/exec", () => ({ exec: execMock }));

// Import triggers run() as a side effect — the error is caught internally.
// We call run() directly in each test with properly configured mocks.
const { run } = await import("../src/setup");

function makeTempDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `test-setup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe("setup", () => {
  let cacheDir: string;

  beforeEach(() => {
    infoMock.mockClear();
    setFailedMock.mockClear();
    setOutputMock.mockClear();
    addPathMock.mockClear();
    exportVariableMock.mockClear();
    isDebugMock.mockClear();
    saveStateMock.mockClear();
    getJsonMock.mockClear();
    findMock.mockClear();
    downloadToolMock.mockClear();
    extractTarMock.mockClear();
    extractZipMock.mockClear();
    cacheDirMock.mockClear();
    execMock.mockClear();
    summaryObj.addHeading.mockClear();
    summaryObj.addTable.mockClear();
    summaryWriteMock.mockClear();
    getInputValues = {};
    getBooleanInputValues = { cache: true };

    // Default: resolveVersion returns 0.2.0, downloadOcx hits cache,
    // no toolchain present (toolchain phase silently skips).
    getJsonMock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: { tag_name: "v0.2.0" },
        headers: {},
      }),
    );
    cacheDir = makeCacheDir();
    findMock.mockImplementation(() => cacheDir);
  });

  test("reads inputs and calls resolveVersion", async () => {
    getInputValues = { version: "latest", "github-token": "tok", libc: "" };
    await run();
    expect(getJsonMock).toHaveBeenCalled();
  });

  test("calls downloadOcx with resolved version", async () => {
    getInputValues = { version: "latest", "github-token": "tok", libc: "" };
    await run();
    expect(findMock).toHaveBeenCalledWith("ocx", "0.2.0", process.arch);
  });

  test("sets outputs version, ocx-path, and cache-hit", async () => {
    getInputValues = { version: "latest", "github-token": "", libc: "" };
    await run();
    expect(setOutputMock).toHaveBeenCalledWith("version", "0.2.0");
    expect(setOutputMock).toHaveBeenCalledWith("cache-hit", "true");
  });

  test("sets toolchain outputs to false when no ocx.toml present", async () => {
    getInputValues = {
      version: "latest",
      "github-token": "",
      libc: "",
      toolchain: "ocx.toml",
      "working-directory": makeTempDir(),
    };
    await run();
    expect(setOutputMock).toHaveBeenCalledWith("toolchain-loaded", "false");
    expect(setOutputMock).toHaveBeenCalledWith("toolchain-cache-hit", "false");
  });

  test("activates toolchain when ocx.toml exists", async () => {
    const projDir = makeTempDir();
    fs.writeFileSync(path.join(projDir, "ocx.toml"), "[tools]\n");
    fs.writeFileSync(path.join(projDir, "ocx.lock"), "x");
    getInputValues = {
      version: "latest",
      "github-token": "",
      libc: "gnu",
      toolchain: "ocx.toml",
      "working-directory": projDir,
    };
    getBooleanInputValues = { cache: false };
    await run();
    expect(setOutputMock).toHaveBeenCalledWith("toolchain-loaded", "true");
    expect(execMock).toHaveBeenCalled();
    // Ensure OCX_HOME was exported (toolchain phase ran).
    expect(exportVariableMock).toHaveBeenCalledWith("OCX_HOME", expect.any(String));
  });

  test("toolchain disabled when toolchain input is empty", async () => {
    const projDir = makeTempDir();
    fs.writeFileSync(path.join(projDir, "ocx.toml"), "[tools]\n");
    getInputValues = {
      version: "latest",
      "github-token": "",
      libc: "",
      toolchain: "",
      "working-directory": projDir,
    };
    await run();
    expect(setOutputMock).toHaveBeenCalledWith("toolchain-loaded", "false");
    expect(execMock).not.toHaveBeenCalled();
  });

  test("calls core.addPath with binDir", async () => {
    getInputValues = { version: "latest", "github-token": "", libc: "" };
    await run();
    expect(addPathMock).toHaveBeenCalled();
  });

  test("exports OCX_NO_UPDATE_CHECK", async () => {
    getInputValues = { version: "latest", "github-token": "", libc: "" };
    await run();
    expect(exportVariableMock).toHaveBeenCalledWith("OCX_NO_UPDATE_CHECK", "1");
  });

  test("writes job summary", async () => {
    getInputValues = { version: "latest", "github-token": "", libc: "" };
    await run();
    expect(summaryObj.addHeading).toHaveBeenCalledWith("OCX Setup", 3);
    expect(summaryObj.addTable).toHaveBeenCalled();
    expect(summaryWriteMock).toHaveBeenCalled();
  });

  test("calls core.setFailed on error", async () => {
    getInputValues = { version: "latest", "github-token": "", libc: "" };
    getJsonMock.mockImplementation(() => Promise.reject(new Error("boom")));
    await run();
    expect(setFailedMock).toHaveBeenCalled();
  });

  test("validates libc input — rejects invalid values", async () => {
    getInputValues = { version: "latest", "github-token": "", libc: "invalid" };
    await run();
    expect(setFailedMock).toHaveBeenCalledWith(
      'Invalid libc value: "invalid". Must be "gnu" or "musl".',
    );
  });

  test("validates version input — rejects malformed values", async () => {
    getInputValues = { version: "not-a-version", "github-token": "", libc: "" };
    await run();
    expect(setFailedMock).toHaveBeenCalledWith(
      'Invalid version format: "not-a-version". Use "latest" or a semver version (e.g., "0.2.0").',
    );
  });

  test("exports OCX_LOG=debug when debug mode is enabled", async () => {
    getInputValues = { version: "latest", "github-token": "", libc: "" };
    isDebugMock.mockImplementation(() => true);
    await run();
    expect(exportVariableMock).toHaveBeenCalledWith("OCX_LOG", "debug");
  });
});
