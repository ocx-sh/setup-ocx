import { describe, test, expect, mock, beforeEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// --- Mocks ---

const infoMock = mock(() => {});
const warningMock = mock(() => {});
const exportVariableMock = mock(() => {});
const addPathMock = mock(() => {});
const saveStateMock = mock(() => {});
const groupMock = mock(async (_name: string, fn: () => Promise<unknown>) => {
  return fn();
});

let getInputValues: Record<string, string> = {};
let booleanInputValues: Record<string, boolean> = {};

// Full surface — bun's mock.module is process-global, so a missing key here
// leaks to other test files whose source modules touch the missing function.
mock.module("@actions/core", () => ({
  info: infoMock,
  debug: mock(() => {}),
  warning: warningMock,
  getInput: mock((name: string) => getInputValues[name] ?? ""),
  getBooleanInput: mock((name: string) => booleanInputValues[name] ?? false),
  setOutput: mock(() => {}),
  setFailed: mock(() => {}),
  exportVariable: exportVariableMock,
  addPath: addPathMock,
  isDebug: mock(() => false),
  saveState: saveStateMock,
  group: groupMock,
  summary: {
    addHeading: mock(function (this: unknown) { return this; }),
    addTable: mock(function (this: unknown) { return this; }),
    write: mock(() => Promise.resolve({ filePath: "" })),
  },
}));

interface ExecCall {
  bin: string;
  args: string[];
  cwd?: string;
}
const execCalls: ExecCall[] = [];
let envOutput = "";

const execMock = mock(
  async (
    bin: string,
    args: string[],
    options?: {
      cwd?: string;
      listeners?: { stdout?: (data: Buffer) => void };
    },
  ): Promise<number> => {
    execCalls.push({ bin, args, cwd: options?.cwd });
    if (args.includes("env") && options?.listeners?.stdout) {
      options.listeners.stdout(Buffer.from(envOutput));
    }
    return 0;
  },
);

mock.module("@actions/exec", () => ({ exec: execMock }));

// Use the real ../src/cache module — mocking source modules pollutes other
// test files because bun's mock.module is global. We mock @actions/cache
// directly instead.
const isFeatureAvailableMock = mock(() => false);
const restoreCacheMock = mock(() => Promise.resolve(undefined as string | undefined));
const saveCacheMock = mock(() => Promise.resolve(0));

mock.module("@actions/cache", () => ({
  isFeatureAvailable: isFeatureAvailableMock,
  restoreCache: restoreCacheMock,
  saveCache: saveCacheMock,
}));

const { applyShellExports, readToolchainInputs, loadToolchain } = await import(
  "../src/toolchain"
);

function tempDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `test-toolchain-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("applyShellExports", () => {
  beforeEach(() => {
    exportVariableMock.mockClear();
    addPathMock.mockClear();
  });

  test("splits bash PATH prepend into individual addPath calls", () => {
    const text = [
      'export PATH="/a/b:/c/d:${PATH}"',
      'export OCX_TOOL_FOO="bar"',
    ].join("\n");
    applyShellExports(text, "bash");
    const sep = process.platform === "win32" ? ";" : ":";
    if (sep === ":") {
      expect(addPathMock).toHaveBeenCalledWith("/a/b");
      expect(addPathMock).toHaveBeenCalledWith("/c/d");
    }
    expect(exportVariableMock).toHaveBeenCalledWith("OCX_TOOL_FOO", "bar");
  });

  test("ignores blank lines and comments", () => {
    const text = "# header\n\n   \nexport FOO=\"bar\"";
    applyShellExports(text, "bash");
    expect(exportVariableMock).toHaveBeenCalledTimes(1);
  });

  test("parses unquoted bash values", () => {
    const text = "export FOO=baz";
    applyShellExports(text, "bash");
    expect(exportVariableMock).toHaveBeenCalledWith("FOO", "baz");
  });

  test("parses powershell exports", () => {
    const text = [
      '$env:OCX_TOOL_FOO = "bar"',
      '$env:PATH = "C:\\a;C:\\b;$env:PATH"',
    ].join("\n");
    applyShellExports(text, "powershell");
    expect(exportVariableMock).toHaveBeenCalledWith("OCX_TOOL_FOO", "bar");
  });
});

describe("readToolchainInputs", () => {
  beforeEach(() => {
    getInputValues = {};
    booleanInputValues = {};
    warningMock.mockClear();
  });

  test("returns null when toolchain input is empty (opt-out)", () => {
    getInputValues = { toolchain: "" };
    expect(readToolchainInputs()).toBeNull();
  });

  test("returns null when toolchain file does not exist", () => {
    const dir = tempDir();
    getInputValues = { toolchain: "ocx.toml", "working-directory": dir };
    try {
      expect(readToolchainInputs()).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("populates fields when ocx.toml exists", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "[tools]\n");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "x");
    getInputValues = {
      toolchain: "ocx.toml",
      "working-directory": dir,
      groups: "ci,lint",
      "cache-suffix": "v1",
    };
    booleanInputValues = { cache: true };
    try {
      const cfg = readToolchainInputs();
      expect(cfg).not.toBeNull();
      expect(cfg!.toolchainFile).toBe(path.join(dir, "ocx.toml"));
      expect(cfg!.lockFile).toBe(path.join(dir, "ocx.lock"));
      expect(cfg!.groups).toEqual(["ci", "lint"]);
      expect(cfg!.cacheEnabled).toBe(true);
      expect(cfg!.cacheSuffix).toBe("v1");
      expect(cfg!.ocxHome).toBe(path.join(os.homedir(), ".ocx"));
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("warns when ocx.toml present but ocx.lock missing", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "[tools]\n");
    getInputValues = { toolchain: "ocx.toml", "working-directory": dir };
    booleanInputValues = { cache: true };
    try {
      const cfg = readToolchainInputs();
      expect(cfg).not.toBeNull();
      expect(warningMock).toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("respects ocx-home input", () => {
    const dir = tempDir();
    const home = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "");
    getInputValues = {
      toolchain: "ocx.toml",
      "working-directory": dir,
      "ocx-home": home,
    };
    booleanInputValues = { cache: true };
    try {
      const cfg = readToolchainInputs();
      expect(cfg!.ocxHome).toBe(home);
    } finally {
      fs.rmSync(dir, { recursive: true });
      fs.rmSync(home, { recursive: true });
    }
  });
});

describe("loadToolchain", () => {
  beforeEach(() => {
    execCalls.length = 0;
    exportVariableMock.mockClear();
    addPathMock.mockClear();
    saveStateMock.mockClear();
    isFeatureAvailableMock.mockClear();
    restoreCacheMock.mockClear();
    saveCacheMock.mockClear();
    envOutput = 'export PATH="/opt/bun/bin:${PATH}"\nexport BUN_VERSION="1.3"\n';
    // Default: cache feature unavailable — restoreObjectStoreCache returns
    // hit=false without exercising @actions/cache.
    isFeatureAvailableMock.mockImplementation(() => false);
  });

  test("exports OCX_HOME and runs pull + env", async () => {
    const dir = tempDir();
    const home = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "[tools]\n");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "x");
    try {
      await loadToolchain({
        ocxBin: "/usr/local/bin/ocx",
        ocxVersion: "0.3.1",
        libc: "gnu",
        inputs: {
          workingDirectory: dir,
          toolchainFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: [],
          ocxHome: home,
          cacheEnabled: true,
          cacheSuffix: "",
        },
      });
      expect(exportVariableMock).toHaveBeenCalledWith("OCX_HOME", home);
      expect(execCalls[0].args).toEqual(["--project", path.join(dir, "ocx.toml"), "pull"]);
      expect(execCalls[1].args.slice(0, 3)).toEqual([
        "--project",
        path.join(dir, "ocx.toml"),
        "env",
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true });
      fs.rmSync(home, { recursive: true });
    }
  });

  test("forwards groups to ocx pull -g", async () => {
    const dir = tempDir();
    const home = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "");
    try {
      await loadToolchain({
        ocxBin: "/usr/local/bin/ocx",
        ocxVersion: "0.3.1",
        libc: "gnu",
        inputs: {
          workingDirectory: dir,
          toolchainFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: ["ci", "lint"],
          ocxHome: home,
          cacheEnabled: false,
          cacheSuffix: "",
        },
      });
      const pull = execCalls.find((c) => c.args.includes("pull"));
      expect(pull!.args).toEqual([
        "--project",
        path.join(dir, "ocx.toml"),
        "pull",
        "-g",
        "ci,lint",
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true });
      fs.rmSync(home, { recursive: true });
    }
  });

  test("saves state for the post step when cache enabled", async () => {
    const dir = tempDir();
    const home = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "x");
    try {
      await loadToolchain({
        ocxBin: "/usr/local/bin/ocx",
        ocxVersion: "0.3.1",
        libc: "gnu",
        inputs: {
          workingDirectory: dir,
          toolchainFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: [],
          ocxHome: home,
          cacheEnabled: true,
          cacheSuffix: "",
        },
      });
      // Real buildCacheKey produces deterministic shape including os/arch.
      const expectedKeyPrefix = `setup-ocx-store-${process.platform}-${process.arch}-gnu-ocx0.3.1-`;
      const cacheKeyCall = saveStateMock.mock.calls.find((c: unknown[]) => c[0] === "cache-key");
      expect(cacheKeyCall).toBeDefined();
      expect(cacheKeyCall![1] as string).toContain(expectedKeyPrefix);
      expect(saveStateMock).toHaveBeenCalledWith("ocx-home", home);
      expect(saveStateMock).toHaveBeenCalledWith("cache-hit", "false");
    } finally {
      fs.rmSync(dir, { recursive: true });
      fs.rmSync(home, { recursive: true });
    }
  });

  test("skips cache restore and state save when cache disabled", async () => {
    const dir = tempDir();
    const home = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "");
    try {
      await loadToolchain({
        ocxBin: "/usr/local/bin/ocx",
        ocxVersion: "0.3.1",
        libc: "gnu",
        inputs: {
          workingDirectory: dir,
          toolchainFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: [],
          ocxHome: home,
          cacheEnabled: false,
          cacheSuffix: "",
        },
      });
      expect(restoreCacheMock).not.toHaveBeenCalled();
      expect(saveStateMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { recursive: true });
      fs.rmSync(home, { recursive: true });
    }
  });

  test("uses powershell shell on win32", async () => {
    const oldPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    const dir = tempDir();
    const home = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "");
    envOutput = '$env:PATH = "C:\\bun;$env:PATH"\n';
    try {
      await loadToolchain({
        ocxBin: "C:\\ocx\\ocx.exe",
        ocxVersion: "0.3.1",
        libc: "",
        inputs: {
          workingDirectory: dir,
          toolchainFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: [],
          ocxHome: home,
          cacheEnabled: false,
          cacheSuffix: "",
        },
      });
      const envCall = execCalls.find((c) => c.args.includes("env"));
      expect(envCall!.args).toContain("--shell=powershell");
    } finally {
      Object.defineProperty(process, "platform", { value: oldPlatform });
      fs.rmSync(dir, { recursive: true });
      fs.rmSync(home, { recursive: true });
    }
  });
});
