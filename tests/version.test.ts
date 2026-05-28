import { describe, test, expect, mock, beforeEach } from "bun:test";

const infoMock = mock(() => {});
const warningMock = mock(() => {});

mock.module("@actions/core", () => ({
  info: infoMock,
  debug: mock(() => {}),
  warning: warningMock,
  getInput: mock(() => ""),
  getBooleanInput: mock(() => false),
  setOutput: mock(() => {}),
  setFailed: mock(() => {}),
  addPath: mock(() => {}),
  exportVariable: mock(() => {}),
  isDebug: mock(() => false),
  saveState: mock(() => {}),
  group: mock(async (_name: string, fn: () => Promise<unknown>) => fn()),
  summary: {
    addHeading: mock(function (this: unknown) { return this; }),
    addTable: mock(function (this: unknown) { return this; }),
    write: mock(() => Promise.resolve({ filePath: "" })),
  },
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

const { resolveVersion } = await import("../src/version");

describe("resolveVersion", () => {
  beforeEach(() => {
    getJsonMock.mockClear();
    infoMock.mockClear();
    warningMock.mockClear();
    // Restore the default success response between tests.
    getJsonMock.mockImplementation(() =>
      Promise.resolve({
        statusCode: 200,
        result: { tag_name: "v0.2.0" },
        headers: {},
      }),
    );
  });

  test("returns exact version unchanged", async () => {
    expect(await resolveVersion("0.2.0", "")).toBe("0.2.0");
    expect(getJsonMock).not.toHaveBeenCalled();
  });

  test("strips v prefix from exact version", async () => {
    expect(await resolveVersion("v0.2.0", "")).toBe("0.2.0");
    expect(getJsonMock).not.toHaveBeenCalled();
  });

  test("resolves 'latest' via GitHub API in a single attempt on success", async () => {
    const version = await resolveVersion("latest", "test-token");
    expect(version).toBe("0.2.0");
    expect(getJsonMock).toHaveBeenCalledTimes(1);
    expect(warningMock).not.toHaveBeenCalled();
  });

  test("retries on transient HTTP 503 then succeeds", async () => {
    let attempt = 0;
    getJsonMock.mockImplementation(() => {
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
    expect(getJsonMock).toHaveBeenCalledTimes(2);
    expect(warningMock).toHaveBeenCalledTimes(1);
  });

  test("retries on empty body then succeeds", async () => {
    let attempt = 0;
    getJsonMock.mockImplementation(() => {
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
    expect(getJsonMock).toHaveBeenCalledTimes(2);
  });

  test("retries on thrown error then succeeds", async () => {
    let attempt = 0;
    getJsonMock.mockImplementation(() => {
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
    expect(getJsonMock).toHaveBeenCalledTimes(2);
  });

  test("throws with attempt summary when all retries fail", async () => {
    getJsonMock.mockImplementation(() =>
      Promise.resolve({ statusCode: 200, result: null, headers: {} }),
    );
    await expect(resolveVersion("latest", "")).rejects.toThrow(
      /Failed to resolve latest OCX version after 3 attempts/,
    );
    expect(getJsonMock).toHaveBeenCalledTimes(3);
  });

  test("error message includes all attempts' status codes", async () => {
    getJsonMock.mockImplementation(() =>
      Promise.resolve({ statusCode: 500, result: null, headers: {} }),
    );
    await expect(resolveVersion("latest", "")).rejects.toThrow(/HTTP 500/);
  });
});
