import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { cacheMocks, coreMocks, execMocks, inputState, resetMocks } from "./setup-mocks.js";
import { applyShellExports, loadProject, readProjectInputs } from "../src/project.js";

interface ExecCall {
  bin: string;
  args: string[];
  cwd?: string;
}
const execCalls: ExecCall[] = [];
let envOutput = "";

beforeEach(() => {
  resetMocks();
  execCalls.length = 0;
  envOutput = 'export PATH="/opt/bun/bin:${PATH}"\nexport BUN_VERSION="1.3"\n';
  execMocks.exec.mockImplementation(
    async (bin: string, args?: string[], options?): Promise<number> => {
      execCalls.push({ bin, args: args ?? [], cwd: options?.cwd });
      if (args?.includes("env") && options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(envOutput));
      }
      return 0;
    },
  );
});

afterEach(() => {
  mock.restore();
});

function tempDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `test-project-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("applyShellExports", () => {
  test("splits bash PATH prepend into individual addPath calls", () => {
    const text = ['export PATH="/a/b:/c/d:${PATH}"', 'export OCX_TOOL_FOO="bar"'].join("\n");
    applyShellExports(text, "bash");
    const sep = process.platform === "win32" ? ";" : ":";
    if (sep === ":") {
      expect(coreMocks.addPath).toHaveBeenCalledWith("/a/b");
      expect(coreMocks.addPath).toHaveBeenCalledWith("/c/d");
    }
    expect(coreMocks.exportVariable).toHaveBeenCalledWith("OCX_TOOL_FOO", "bar");
  });

  test("ignores blank lines and comments", () => {
    const text = '# header\n\n   \nexport FOO="bar"';
    applyShellExports(text, "bash");
    expect(coreMocks.exportVariable).toHaveBeenCalledTimes(1);
  });

  test("parses unquoted bash values", () => {
    const text = "export FOO=baz";
    applyShellExports(text, "bash");
    expect(coreMocks.exportVariable).toHaveBeenCalledWith("FOO", "baz");
  });

  test("parses powershell exports", () => {
    const text = ['$env:OCX_TOOL_FOO = "bar"', '$env:PATH = "C:\\a;C:\\b;$env:PATH"'].join("\n");
    applyShellExports(text, "powershell");
    expect(coreMocks.exportVariable).toHaveBeenCalledWith("OCX_TOOL_FOO", "bar");
  });
});

describe("readProjectInputs", () => {
  test("returns null when project input is empty (opt-out)", () => {
    inputState.inputs = { project: "" };
    expect(readProjectInputs()).toBeNull();
  });

  test("returns null when project file does not exist", () => {
    const dir = tempDir();
    inputState.inputs = { project: "ocx.toml", "working-directory": dir };
    try {
      expect(readProjectInputs()).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("populates fields when ocx.toml exists", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "[tools]\n");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "x");
    inputState.inputs = {
      project: "ocx.toml",
      "working-directory": dir,
      groups: "ci,lint",
      "cache-suffix": "v1",
    };
    inputState.booleanInputs = { cache: true };
    try {
      const cfg = readProjectInputs();
      expect(cfg).not.toBeNull();
      expect(cfg!.projectFile).toBe(path.join(dir, "ocx.toml"));
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
    inputState.inputs = { project: "ocx.toml", "working-directory": dir };
    inputState.booleanInputs = { cache: true };
    try {
      const cfg = readProjectInputs();
      expect(cfg).not.toBeNull();
      expect(coreMocks.warning).toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("respects ocx-home input", () => {
    const dir = tempDir();
    const home = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "");
    inputState.inputs = {
      project: "ocx.toml",
      "working-directory": dir,
      "ocx-home": home,
    };
    inputState.booleanInputs = { cache: true };
    try {
      const cfg = readProjectInputs();
      expect(cfg!.ocxHome).toBe(home);
    } finally {
      fs.rmSync(dir, { recursive: true });
      fs.rmSync(home, { recursive: true });
    }
  });
});

describe("loadProject", () => {
  test("exports OCX_HOME and runs pull + env", async () => {
    const dir = tempDir();
    const home = tempDir();
    fs.writeFileSync(path.join(dir, "ocx.toml"), "[tools]\n");
    fs.writeFileSync(path.join(dir, "ocx.lock"), "x");
    try {
      await loadProject({
        ocxBin: "/usr/local/bin/ocx",
        ocxVersion: "0.3.1",
        libc: "gnu",
        inputs: {
          workingDirectory: dir,
          projectFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: [],
          ocxHome: home,
          cacheEnabled: true,
          cacheSuffix: "",
        },
      });
      expect(coreMocks.exportVariable).toHaveBeenCalledWith("OCX_HOME", home);
      expect(execCalls[0]?.args).toEqual(["--project", path.join(dir, "ocx.toml"), "pull"]);
      expect(execCalls[1]?.args.slice(0, 3)).toEqual([
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
      await loadProject({
        ocxBin: "/usr/local/bin/ocx",
        ocxVersion: "0.3.1",
        libc: "gnu",
        inputs: {
          workingDirectory: dir,
          projectFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: ["ci", "lint"],
          ocxHome: home,
          cacheEnabled: false,
          cacheSuffix: "",
        },
      });
      const pull = execCalls.find((c) => c.args.includes("pull"));
      expect(pull?.args).toEqual([
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
      await loadProject({
        ocxBin: "/usr/local/bin/ocx",
        ocxVersion: "0.3.1",
        libc: "gnu",
        inputs: {
          workingDirectory: dir,
          projectFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: [],
          ocxHome: home,
          cacheEnabled: true,
          cacheSuffix: "",
        },
      });
      const expectedKeyPrefix = `setup-ocx-store-${process.platform}-${process.arch}-gnu-ocx0.3.1-`;
      const cacheKeyCall = coreMocks.saveState.mock.calls.find(
        (c: unknown[]) => c[0] === "cache-key",
      );
      expect(cacheKeyCall).toBeDefined();
      expect(cacheKeyCall![1] as string).toContain(expectedKeyPrefix);
      expect(coreMocks.saveState).toHaveBeenCalledWith("ocx-home", home);
      expect(coreMocks.saveState).toHaveBeenCalledWith("cache-hit", "false");
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
      await loadProject({
        ocxBin: "/usr/local/bin/ocx",
        ocxVersion: "0.3.1",
        libc: "gnu",
        inputs: {
          workingDirectory: dir,
          projectFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: [],
          ocxHome: home,
          cacheEnabled: false,
          cacheSuffix: "",
        },
      });
      expect(cacheMocks.restoreCache).not.toHaveBeenCalled();
      expect(coreMocks.saveState).not.toHaveBeenCalled();
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
      await loadProject({
        ocxBin: "C:\\ocx\\ocx.exe",
        ocxVersion: "0.3.1",
        libc: "",
        inputs: {
          workingDirectory: dir,
          projectFile: path.join(dir, "ocx.toml"),
          lockFile: path.join(dir, "ocx.lock"),
          groups: [],
          ocxHome: home,
          cacheEnabled: false,
          cacheSuffix: "",
        },
      });
      const envCall = execCalls.find((c) => c.args.includes("env"));
      expect(envCall?.args).toContain("--shell=powershell");
    } finally {
      Object.defineProperty(process, "platform", { value: oldPlatform });
      fs.rmSync(dir, { recursive: true });
      fs.rmSync(home, { recursive: true });
    }
  });
});
