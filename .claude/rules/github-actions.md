# GitHub Action Best Practices

Rules for developing and maintaining this JavaScript/TypeScript GitHub Action. These are derived from official GitHub documentation, the GitHub Well-Architected framework, OpenSSF Scorecard, and community standards.

---

## 1. Security

### Input Validation

- Validate and sanitize all `core.getInput()` values. Do not trust that callers provide well-formed input.
- Validate types, ranges, and formats before using input values in logic or constructing URLs/paths.
- Use `core.getBooleanInput()` for boolean inputs (handles YAML 1.2 variants) and `core.getMultilineInput()` for list inputs.
- The `libc` input must be validated against allowed values (`"gnu"` or `"musl"`) — do not accept arbitrary strings via unsafe casts like `as Libc`.

### Token Handling

- Never log or expose tokens. Use `core.setSecret()` to mask dynamically generated sensitive values.
- Default `github-token` to `${{ github.token }}` and document why it is needed (API rate limits, private release access).
- Pass tokens to HTTP clients via `Authorization` headers — never embed them in URLs.

### Checksum Verification

- Always verify SHA256 checksums of downloaded binaries before extraction or caching.
- Download the `.sha256` file from the same release and compare against the computed hash of the archive.
- Fail hard (throw) on any mismatch — never proceed with an unverified binary.

### Workflow Security

- Set explicit `permissions` per-job in CI workflows (not workflow-level). Default to minimal permissions.
- Pin third-party actions to full-length commit SHAs in CI workflows (not tags). Example: `actions/checkout@<sha>` not `actions/checkout@v4`.
- Never interpolate untrusted context values (`github.event.*`) directly into `run:` scripts. Use intermediate environment variables.

### Supply Chain

- Keep dependencies minimal. Audit all runtime dependencies.
- Generate `licenses.txt` to track third-party licenses in the bundle.
- Enable Dependabot for both npm and GitHub Actions dependencies.

---

## 2. Action Metadata (`action.yml`)

- Every input must have a `description` field.
- Set `required: true` only for inputs without sensible defaults. For optional inputs, always provide a `default`.
- Use the `deprecationMessage` field when retiring inputs.
- Declare all outputs with clear descriptions. Outputs are capped at 1 MB per job.
- Use `runs.using: 'node24'` (current GitHub-supported runtime).
- Add `branding` with `icon` and `color` for marketplace visibility.
- Keep `action.yml` as the single source of truth for the action's public interface.

---

## 3. Code Quality

### Error Handling

- Wrap the entire action in `async function run()` with try/catch. Call `core.setFailed(error.message)` in the catch block.
- Use `core.error()` for non-fatal error annotations and `core.setFailed()` for fatal errors that should fail the step.
- Use `core.warning()` for non-fatal issues and `core.notice()` for informational annotations.
- Fail early with clear messages when input validation fails — don't wait until deep in the logic to surface problems.

### Logging

- Use `core.debug()` for verbose diagnostic output (hidden unless `ACTIONS_STEP_DEBUG` is true).
- Use `core.info()` for normal operational messages (target resolved, download started, checksum verified).
- Use `core.startGroup()` / `core.endGroup()` to collapse verbose log sections.
- Never log sensitive values (tokens, secrets, checksums of private assets).

### Archive Extraction Flags

- Use correct tar extraction flags for the archive format:
  - `.tar.gz` → flags `xz` (gzip)
  - `.tar.xz` → flags `xJ` (xz/lzma)
- The flag selection logic must match the actual archive extension produced by `getArchiveName()`.

### Path Handling

- Use `path.join()` for constructing filesystem paths — never string concatenation with `/`.
- This ensures cross-platform compatibility (Windows uses `\`).

---

## 4. Testing

### Structure

- Map test files 1:1 to source modules.
- Mock `@actions/core`, `@actions/http-client`, and `@actions/tool-cache` in tests — never call real GitHub APIs or download real binaries in unit tests.
- Use `beforeEach` to clear mocks between tests for isolation.

### Coverage

- Test all platform/architecture combinations in `getTarget()`.
- Test both happy paths and error paths (API failures, checksum mismatches, unsupported platforms).
- Test `downloadOcx()` end-to-end with mocked toolkit functions — not just `findBinDir`.
- Clean up temporary files/directories in `finally` blocks.

### Missing Test Areas

- `setup.ts` (the entry point) should have tests verifying the orchestration flow.
- `downloadOcx()` should have tests for: cache hits, cache misses with successful download, checksum verification failure, extraction for both zip and tar.xz.
- Verify that `core.setFailed()` is called on errors, not just that errors are thrown.

---

## 5. Performance

### Tool Caching

- Always check the tool cache (`tc.find()`) before downloading. Return early on cache hit.
- Use precise cache keys that include tool name, version, and architecture.
- Cache extracted directories (not archives) for faster restoration.

### Dependencies

- Keep runtime dependencies minimal — only `@actions/*` toolkit packages.
- Bundle everything with esbuild so no `npm install` is needed at runtime.
- Use `@actions/http-client` instead of heavier alternatives (axios, node-fetch).
- Audit `dependencies` after every change — drop entries that no module under `src/` imports.

---

## 6. Distribution

### Bundling

- Use `esbuild` to compile TypeScript and all dependencies into a single `dist/setup/index.js`.
- Never commit `node_modules/`.
- The build script generates `licenses.txt` alongside the bundle from bundled package LICENSE files.

### Committed `dist/`

- The `dist/` directory must be committed — GitHub Actions loads it directly.
- CI must verify `dist/` freshness: rebuild, then `git diff --exit-code dist/`. Fail on drift.

### Versioning

- Follow semantic versioning (MAJOR.MINOR.PATCH).
- Maintain floating major version tags (`v1`) pointing to the latest release in that line.
- Bump major version only for breaking changes (removed inputs, changed behavior).

---

## 7. CI/CD Workflows

### Required Checks

- Unit tests must run on every push to main and every PR.
- `dist/` freshness check must run on every PR (prevents stale bundles from merging).
- Integration test (dogfood with `uses: ./`) must run on every PR.

### Matrix Testing

- Test across operating systems (ubuntu, macos, windows) for cross-platform actions.
- The deep verification workflow covers this but should also be triggered on PRs to main (not just `workflow_dispatch`).

### Workflow Hygiene

- Pin third-party actions to commit SHAs.
- Set explicit `permissions` per job.
- Use `shell: bash` on Windows jobs for consistent behavior.
- Avoid interpolating step outputs directly in `run:` blocks — use environment variables.

---

## 8. Documentation

- Keep README inputs/outputs table in sync with `action.yml`.
- Provide copy-pasteable usage examples as complete workflow snippets.
- Document required `GITHUB_TOKEN` permissions.
- Add a "Permissions" section to the README.
- Keep CONTRIBUTING.md in sync with project layout, build commands, and test commands.

---

## Sources

- [GitHub Docs - Creating a JavaScript Action](https://docs.github.com/actions/tutorials/creating-a-javascript-action)
- [GitHub Docs - Metadata Syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax)
- [GitHub Docs - Secure Use Reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Docs - Setting Exit Codes](https://docs.github.com/en/actions/sharing-automations/creating-actions/setting-exit-codes-for-actions)
- [GitHub Well-Architected - Actions Security](https://wellarchitected.github.com/library/application-security/recommendations/actions-security/)
- [GitHub Toolkit - Action Versioning](https://github.com/actions/toolkit/blob/main/docs/action-versioning.md)
- [OpenSSF Scorecard](https://scorecard.dev/)
