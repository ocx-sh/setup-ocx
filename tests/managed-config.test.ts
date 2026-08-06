import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { coreMocks, execMocks, inputState, resetMocks } from "./setup-mocks.js";
import { adoptManagedConfig } from "../src/managed-config.js";

function tempDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `test-managed-config-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let originalManagedConfigEnv: string | undefined;

beforeEach(() => {
  resetMocks();
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

describe("adoptManagedConfig", () => {
  test("no-op when neither the input nor the env var is set", async () => {
    inputState.inputs = {};
    // Version below the floor on purpose: the trigger must be read before the
    // version gate, so an untriggered run never fails on a too-old ocx.
    const adopted = await adoptManagedConfig("/usr/local/bin/ocx", "0.1.0");
    expect(adopted).toBe(false);
    expect(execMocks.exec).not.toHaveBeenCalled();
    expect(coreMocks.exportVariable).not.toHaveBeenCalledWith("OCX_HOME", expect.any(String));
  });

  test("rejects an ocx older than 0.4.3 when only the env var is set", async () => {
    inputState.inputs = {};
    process.env.OCX_MANAGED_CONFIG = "ocx.sh/acme/fleet";
    await expect(adoptManagedConfig("/usr/local/bin/ocx", "0.4.2")).rejects.toThrow(
      /requires ocx >= 0\.4\.3/,
    );
    expect(execMocks.exec).not.toHaveBeenCalled();
  });

  test("rejects a prerelease of the floor version (0.4.3-rc.1 < 0.4.3)", async () => {
    inputState.inputs = {};
    process.env.OCX_MANAGED_CONFIG = "ocx.sh/acme/fleet";
    await expect(adoptManagedConfig("/usr/local/bin/ocx", "0.4.3-rc.1")).rejects.toThrow(
      /requires ocx >= 0\.4\.3/,
    );
    expect(execMocks.exec).not.toHaveBeenCalled();
  });

  test("passes --managed-config and exports OCX_HOME when the input is set", async () => {
    const home = tempDir();
    try {
      inputState.inputs = { "managed-config": "ocx.sh/acme/fleet", "ocx-home": home };
      const adopted = await adoptManagedConfig("/usr/local/bin/ocx", "0.4.3");
      expect(adopted).toBe(true);
      expect(coreMocks.exportVariable).toHaveBeenCalledWith("OCX_HOME", home);
      expect(execMocks.exec).toHaveBeenCalledWith(
        "/usr/local/bin/ocx",
        ["config", "setup", "--managed-config", "ocx.sh/acme/fleet"],
        expect.objectContaining({ cwd: expect.any(String) }),
      );
    } finally {
      fs.rmSync(home, { recursive: true });
    }
  });

  test("runs a bare `ocx config setup` when only the env var is set", async () => {
    const home = tempDir();
    try {
      inputState.inputs = { "ocx-home": home };
      process.env.OCX_MANAGED_CONFIG = "ocx.sh/acme/fleet";
      const adopted = await adoptManagedConfig("/usr/local/bin/ocx", "0.4.3");
      expect(adopted).toBe(true);
      expect(execMocks.exec).toHaveBeenCalledWith(
        "/usr/local/bin/ocx",
        ["config", "setup"],
        expect.objectContaining({ cwd: expect.any(String) }),
      );
    } finally {
      fs.rmSync(home, { recursive: true });
    }
  });

  test("input wins over env — only the input ref is passed explicitly", async () => {
    const home = tempDir();
    try {
      inputState.inputs = { "managed-config": "ocx.sh/acme/fleet-a", "ocx-home": home };
      process.env.OCX_MANAGED_CONFIG = "ocx.sh/acme/fleet-b";
      const adopted = await adoptManagedConfig("/usr/local/bin/ocx", "0.4.3");
      expect(adopted).toBe(true);
      expect(execMocks.exec).toHaveBeenCalledWith(
        "/usr/local/bin/ocx",
        ["config", "setup", "--managed-config", "ocx.sh/acme/fleet-a"],
        expect.anything(),
      );
    } finally {
      fs.rmSync(home, { recursive: true });
    }
  });

  test("respects ocx-home and working-directory inputs", async () => {
    const home = tempDir();
    const workDir = tempDir();
    try {
      inputState.inputs = {
        "managed-config": "ocx.sh/acme/fleet",
        "ocx-home": home,
        "working-directory": workDir,
      };
      await adoptManagedConfig("/usr/local/bin/ocx", "0.4.3");
      expect(coreMocks.exportVariable).toHaveBeenCalledWith("OCX_HOME", home);
      expect(execMocks.exec).toHaveBeenCalledWith(
        "/usr/local/bin/ocx",
        expect.any(Array),
        expect.objectContaining({ cwd: workDir }),
      );
    } finally {
      fs.rmSync(home, { recursive: true });
      fs.rmSync(workDir, { recursive: true });
    }
  });

  test("propagates exec rejection uncaught (hard fail)", async () => {
    const home = tempDir();
    try {
      inputState.inputs = { "managed-config": "ocx.sh/acme/fleet", "ocx-home": home };
      execMocks.exec.mockImplementation(() => Promise.reject(new Error("exit code 80")));
      await expect(adoptManagedConfig("/usr/local/bin/ocx", "0.4.3")).rejects.toThrow(
        "exit code 80",
      );
    } finally {
      fs.rmSync(home, { recursive: true });
    }
  });
});
