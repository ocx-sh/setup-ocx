import { describe, test, expect, mock, beforeEach } from "bun:test";

const infoMock = mock(() => {});

mock.module("@actions/core", () => ({
  info: infoMock,
  debug: mock(() => {}),
  warning: mock(() => {}),
  getInput: mock(() => ""),
  setOutput: mock(() => {}),
  setFailed: mock(() => {}),
  addPath: mock(() => {}),
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
  });

  test("returns exact version unchanged", async () => {
    expect(await resolveVersion("0.2.0", "")).toBe("0.2.0");
    expect(getJsonMock).not.toHaveBeenCalled();
  });

  test("strips v prefix from exact version", async () => {
    expect(await resolveVersion("v0.2.0", "")).toBe("0.2.0");
    expect(getJsonMock).not.toHaveBeenCalled();
  });

  test("resolves 'latest' via GitHub API", async () => {
    const version = await resolveVersion("latest", "test-token");
    expect(version).toBe("0.2.0");
    expect(getJsonMock).toHaveBeenCalledTimes(1);
  });

  test("throws when API returns no result", async () => {
    getJsonMock.mockImplementationOnce(() =>
      Promise.resolve({ statusCode: 200, result: null, headers: {} }),
    );
    await expect(resolveVersion("latest", "")).rejects.toThrow(
      "GitHub API returned no release information",
    );
  });

  test("throws when API request fails", async () => {
    getJsonMock.mockImplementationOnce(() => Promise.reject(new Error("rate limited")));
    await expect(resolveVersion("latest", "")).rejects.toThrow("Failed to fetch latest OCX version");
  });
});
