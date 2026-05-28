import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cacheMocks, coreMocks, inputState, resetMocks } from "./setup-mocks.js";
import { run } from "../src/save-cache.js";

beforeEach(() => {
  resetMocks();
  cacheMocks.isFeatureAvailable.mockImplementation(() => true);
});

afterEach(() => {
  mock.restore();
});

describe("save-cache post step", () => {
  test("saves object store cache when tcKey + ocxHome set and tcHit is false", async () => {
    inputState.state = {
      "cache-key": "store-key",
      "ocx-home": "/home/r/.ocx",
      "cache-hit": "false",
    };
    await run();
    expect(cacheMocks.saveCache).toHaveBeenCalled();
    const call = cacheMocks.saveCache.mock.calls.find((c) => c[1] === "store-key");
    expect(call).toBeDefined();
  });

  test("skips object store save and logs info when tcHit is true", async () => {
    inputState.state = {
      "cache-key": "store-key",
      "ocx-home": "/home/r/.ocx",
      "cache-hit": "true",
    };
    await run();
    const saved = cacheMocks.saveCache.mock.calls.find((c) => c[1] === "store-key");
    expect(saved).toBeUndefined();
    expect(coreMocks.info).toHaveBeenCalledWith(
      expect.stringContaining("object store cache already up to date"),
    );
  });

  test("saves binary cache when binKey + binPath set", async () => {
    inputState.state = {
      "bin-cache-key": "bin-key",
      "bin-cache-path": "/runner/tool-cache/ocx/0.2.0",
    };
    await run();
    const binCall = cacheMocks.saveCache.mock.calls.find((c) => c[1] === "bin-key");
    expect(binCall).toBeDefined();
    expect(binCall![0]).toEqual(["/runner/tool-cache/ocx/0.2.0"]);
  });

  test("no-op when no state present", async () => {
    inputState.state = {};
    await run();
    expect(cacheMocks.saveCache).not.toHaveBeenCalled();
  });

  test("saves both caches when both are set and tcHit is false", async () => {
    inputState.state = {
      "cache-key": "store-key",
      "ocx-home": "/home/r/.ocx",
      "cache-hit": "false",
      "bin-cache-key": "bin-key",
      "bin-cache-path": "/runner/tool-cache/ocx/0.2.0",
    };
    await run();
    expect(cacheMocks.saveCache.mock.calls.find((c) => c[1] === "store-key")).toBeDefined();
    expect(cacheMocks.saveCache.mock.calls.find((c) => c[1] === "bin-key")).toBeDefined();
  });

  test("saveCache failure degrades to warning (does not throw)", async () => {
    inputState.state = {
      "bin-cache-key": "bin-key",
      "bin-cache-path": "/some/path",
    };
    cacheMocks.saveCache.mockImplementation(() => Promise.reject(new Error("upstream 5xx")));
    await expect(run()).resolves.toBeUndefined();
    expect(coreMocks.warning).toHaveBeenCalled();
    expect(coreMocks.setFailed).not.toHaveBeenCalled();
  });

  test("skips object store save when feature unavailable", async () => {
    inputState.state = {
      "cache-key": "store-key",
      "ocx-home": "/home/r/.ocx",
      "cache-hit": "false",
    };
    cacheMocks.isFeatureAvailable.mockImplementation(() => false);
    await run();
    expect(cacheMocks.saveCache.mock.calls.find((c) => c[1] === "store-key")).toBeUndefined();
  });
});
