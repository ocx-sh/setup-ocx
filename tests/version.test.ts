import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { coreMocks, httpMocks, resetMocks } from "./setup-mocks.js";
import { compareVersions, resolveVersion } from "../src/version.js";

describe("compareVersions", () => {
  test("orders by numeric segments", () => {
    expect(compareVersions("0.3.4", "0.3.5")).toBeLessThan(0);
    expect(compareVersions("0.4.0", "0.3.5")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
  });

  test("treats equal versions as 0 and ignores leading v", () => {
    expect(compareVersions("0.3.5", "0.3.5")).toBe(0);
    expect(compareVersions("v0.3.5", "0.3.5")).toBe(0);
  });

  test("treats missing trailing segments as 0", () => {
    expect(compareVersions("0.3", "0.3.0")).toBe(0);
    expect(compareVersions("0.3.5", "0.3")).toBeGreaterThan(0);
  });

  test("sorts a prerelease below its release (capability floors reject it)", () => {
    expect(compareVersions("0.4.3-alpha.1", "0.4.3")).toBeLessThan(0);
    expect(compareVersions("0.4.3-rc.1", "0.4.3")).toBeLessThan(0);
    expect(compareVersions("0.4.3", "0.4.3-rc.1")).toBeGreaterThan(0);
    expect(compareVersions("0.4.4-rc.1", "0.4.3")).toBeGreaterThan(0);
    expect(compareVersions("0.4.3-rc.1", "0.4.3-rc.1")).toBe(0);
  });
});

describe("resolveVersion", () => {
  beforeEach(() => {
    resetMocks();
  });
  afterEach(() => {
    mock.restore();
  });

  test("returns exact version unchanged", async () => {
    expect(await resolveVersion("0.2.0", "")).toBe("0.2.0");
    expect(httpMocks.getJson).not.toHaveBeenCalled();
  });

  test("strips v prefix from exact version", async () => {
    expect(await resolveVersion("v0.2.0", "")).toBe("0.2.0");
    expect(httpMocks.getJson).not.toHaveBeenCalled();
  });

  test("resolves 'latest' via GitHub API in a single attempt on success", async () => {
    const version = await resolveVersion("latest", "test-token");
    expect(version).toBe("0.2.0");
    expect(httpMocks.getJson).toHaveBeenCalledTimes(1);
    expect(coreMocks.warning).not.toHaveBeenCalled();
  });

  test("retries on transient HTTP 503 then succeeds", async () => {
    let attempt = 0;
    httpMocks.getJson.mockImplementation(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.resolve({ statusCode: 503, result: null, headers: {} });
      }
      return Promise.resolve({
        statusCode: 200,
        result: { tag_name: "v1.2.3" },
        headers: {},
      });
    });
    expect(await resolveVersion("latest", "")).toBe("1.2.3");
    expect(httpMocks.getJson).toHaveBeenCalledTimes(2);
    expect(coreMocks.warning).toHaveBeenCalledTimes(1);
  });

  test("retries on empty body then succeeds", async () => {
    let attempt = 0;
    httpMocks.getJson.mockImplementation(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.resolve({ statusCode: 200, result: null, headers: {} });
      }
      return Promise.resolve({
        statusCode: 200,
        result: { tag_name: "v4.5.6" },
        headers: {},
      });
    });
    expect(await resolveVersion("latest", "")).toBe("4.5.6");
    expect(httpMocks.getJson).toHaveBeenCalledTimes(2);
  });

  test("retries on thrown error then succeeds", async () => {
    let attempt = 0;
    httpMocks.getJson.mockImplementation(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.reject(new Error("ECONNRESET"));
      }
      return Promise.resolve({
        statusCode: 200,
        result: { tag_name: "v7.8.9" },
        headers: {},
      });
    });
    expect(await resolveVersion("latest", "")).toBe("7.8.9");
    expect(httpMocks.getJson).toHaveBeenCalledTimes(2);
  });

  test("throws with attempt summary when all retries fail", async () => {
    httpMocks.getJson.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, result: null, headers: {} }),
    );
    await expect(resolveVersion("latest", "")).rejects.toThrow(
      /resolve latest OCX version failed after 3 attempts/,
    );
    expect(httpMocks.getJson).toHaveBeenCalledTimes(3);
  });

  test("error message includes all attempts' status codes", async () => {
    httpMocks.getJson.mockImplementation(() =>
      Promise.resolve({ statusCode: 500, result: null, headers: {} }),
    );
    await expect(resolveVersion("latest", "")).rejects.toThrow(/HTTP 500/);
  });

  test("does not retry on 4xx (except 408/429)", async () => {
    httpMocks.getJson.mockImplementation(() =>
      Promise.resolve({ statusCode: 404, result: null, headers: {} }),
    );
    await expect(resolveVersion("latest", "")).rejects.toThrow(/HTTP 404/);
    expect(httpMocks.getJson).toHaveBeenCalledTimes(1);
  });

  test("retries on 429 Too Many Requests", async () => {
    let attempt = 0;
    httpMocks.getJson.mockImplementation(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.resolve({ statusCode: 429, result: null, headers: {} });
      }
      return Promise.resolve({
        statusCode: 200,
        result: { tag_name: "v2.0.0" },
        headers: {},
      });
    });
    expect(await resolveVersion("latest", "")).toBe("2.0.0");
    expect(httpMocks.getJson).toHaveBeenCalledTimes(2);
  });
});
