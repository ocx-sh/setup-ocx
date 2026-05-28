/**
 * Shared test mocks for @actions/* packages.
 *
 * Bun preloads this file via `bunfig.toml` so every test file gets the same
 * set of mocks regardless of import order. Tests override individual methods
 * via the exported handles (`coreMocks.getInput.mockImplementation(...)`).
 *
 * Rule: do NOT call `mock.module("@actions/..", ...)` from individual test
 * files — see `.claude/rules/testing.md` §2.
 */
import { mock } from "bun:test";

// ─── shared input/state stores (mutated by tests via the resetMocks() helper) ──
export const inputState = {
  inputs: {} as Record<string, string>,
  booleanInputs: {} as Record<string, boolean>,
  state: {} as Record<string, string>,
  debug: false,
};

// ─── @actions/core ────────────────────────────────────────────────────────────
function summaryChain(this: unknown): unknown {
  return this;
}

export const coreMocks = {
  info: mock((_message: string) => {}),
  debug: mock((_message: string) => {}),
  warning: mock((_message: string | Error) => {}),
  error: mock((_message: string | Error) => {}),
  notice: mock((_message: string) => {}),
  getInput: mock((name: string) => inputState.inputs[name] ?? ""),
  getBooleanInput: mock((name: string) => inputState.booleanInputs[name] ?? false),
  getMultilineInput: mock((_name: string): string[] => []),
  setOutput: mock((_name: string, _value: unknown) => {}),
  setFailed: mock((_message: string | Error) => {}),
  setSecret: mock((_secret: string) => {}),
  addPath: mock((_path: string) => {}),
  exportVariable: mock((_name: string, _val: string) => {}),
  isDebug: mock(() => inputState.debug),
  saveState: mock((name: string, value: unknown) => {
    inputState.state[name] = String(value);
  }),
  getState: mock((name: string) => inputState.state[name] ?? ""),
  startGroup: mock((_name: string) => {}),
  endGroup: mock(() => {}),
  group: mock(async <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn()),
  summary: {
    addHeading: mock(summaryChain),
    addTable: mock(summaryChain),
    addRaw: mock(summaryChain),
    addEOL: mock(summaryChain),
    write: mock(() => Promise.resolve({ filePath: "" })),
  },
};

mock.module("@actions/core", () => coreMocks);

// ─── @actions/http-client ─────────────────────────────────────────────────────
export const httpMocks = {
  getJson: mock(
    (
      _url: string,
      _headers?: Record<string, string>,
    ): Promise<{
      statusCode: number;
      result: unknown;
      headers: Record<string, string | string[] | undefined>;
    }> =>
      Promise.resolve({
        statusCode: 200,
        result: { tag_name: "v0.2.0" },
        headers: {},
      }),
  ),
};

class MockHttpClient {
  getJson = httpMocks.getJson;
}

mock.module("@actions/http-client", () => ({
  HttpClient: MockHttpClient,
}));

// ─── @actions/tool-cache ──────────────────────────────────────────────────────
export const tcMocks = {
  find: mock((_tool: string, _version: string, _arch?: string) => ""),
  downloadTool: mock((_url: string, _dest?: string, _auth?: string) =>
    Promise.resolve("/tmp/mock"),
  ),
  extractTar: mock((_file: string, _dest?: string, _flags?: string) =>
    Promise.resolve("/tmp/mock"),
  ),
  extractZip: mock((_file: string, _dest?: string) => Promise.resolve("/tmp/mock")),
  cacheDir: mock((_dir: string, _tool: string, _version: string, _arch?: string) =>
    Promise.resolve("/tmp/mock"),
  ),
};

mock.module("@actions/tool-cache", () => tcMocks);

// ─── @actions/cache ───────────────────────────────────────────────────────────
export const cacheMocks = {
  isFeatureAvailable: mock(() => false),
  restoreCache: mock((_paths: string[], _key: string, _restoreKeys?: string[]) =>
    Promise.resolve(undefined as string | undefined),
  ),
  saveCache: mock((_paths: string[], _key: string) => Promise.resolve(0)),
};

mock.module("@actions/cache", () => cacheMocks);

// ─── @actions/exec ────────────────────────────────────────────────────────────
export interface ExecOptions {
  cwd?: string;
  listeners?: { stdout?: (data: Buffer) => void; stderr?: (data: Buffer) => void };
}

export const execMocks = {
  exec: mock(async (_bin: string, _args?: string[], options?: ExecOptions): Promise<number> => {
    // Default: emit a typical bash PATH export so toolchain tests see something.
    options?.listeners?.stdout?.(Buffer.from('export PATH="/opt/bun/bin:${PATH}"\n'));
    return 0;
  }),
};

mock.module("@actions/exec", () => execMocks);

/**
 * Reset everything to defaults before a test. Call from `beforeEach`.
 *
 * Clears call history on every mock fn and resets the input/state stores.
 * Does NOT reset implementations — tests should re-establish them explicitly.
 */
export function resetMocks(): void {
  mock.clearAllMocks();
  inputState.inputs = {};
  inputState.booleanInputs = {};
  inputState.state = {};
  inputState.debug = false;

  // Re-seed default implementations that some tests rely on.
  coreMocks.getInput.mockImplementation((name: string) => inputState.inputs[name] ?? "");
  coreMocks.getBooleanInput.mockImplementation(
    (name: string) => inputState.booleanInputs[name] ?? false,
  );
  coreMocks.isDebug.mockImplementation(() => inputState.debug);
  coreMocks.saveState.mockImplementation((name: string, value: unknown) => {
    inputState.state[name] = String(value);
  });
  coreMocks.getState.mockImplementation((name: string) => inputState.state[name] ?? "");
  coreMocks.group.mockImplementation(
    async <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn(),
  );
  coreMocks.summary.addHeading.mockImplementation(summaryChain);
  coreMocks.summary.addTable.mockImplementation(summaryChain);
  coreMocks.summary.addRaw.mockImplementation(summaryChain);
  coreMocks.summary.addEOL.mockImplementation(summaryChain);
  coreMocks.summary.write.mockImplementation(() => Promise.resolve({ filePath: "" }));

  httpMocks.getJson.mockImplementation(() =>
    Promise.resolve({
      statusCode: 200,
      result: { tag_name: "v0.2.0" },
      headers: {},
    }),
  );

  tcMocks.find.mockImplementation(() => "");
  tcMocks.downloadTool.mockImplementation(() => Promise.resolve("/tmp/mock"));
  tcMocks.extractTar.mockImplementation(() => Promise.resolve("/tmp/mock"));
  tcMocks.extractZip.mockImplementation(() => Promise.resolve("/tmp/mock"));
  tcMocks.cacheDir.mockImplementation(() => Promise.resolve("/tmp/mock"));

  cacheMocks.isFeatureAvailable.mockImplementation(() => false);
  cacheMocks.restoreCache.mockImplementation(() =>
    Promise.resolve(undefined as string | undefined),
  );
  cacheMocks.saveCache.mockImplementation(() => Promise.resolve(0));

  execMocks.exec.mockImplementation(
    async (_bin: string, _args?: string[], options?: ExecOptions): Promise<number> => {
      options?.listeners?.stdout?.(Buffer.from('export PATH="/opt/bun/bin:${PATH}"\n'));
      return 0;
    },
  );
}
