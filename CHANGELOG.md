# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1](https://github.com/ocx-sh/setup-ocx/releases/tag/v1.2.1) — 2026-06-04

### Fixed

- **windows:** Preempt libuv process_title abort on affected runtimes by @michael-herwig ([85921df](https://github.com/ocx-sh/setup-ocx/commit/85921df63b8aa8ed392cf3410c5fcbee2259525e))
## [1.2.0](https://github.com/ocx-sh/setup-ocx/releases/tag/v1.2.0) — 2026-06-02

### Added

- Adopt ocx env --ci=github for project activation by @michael-herwig ([e50c641](https://github.com/ocx-sh/setup-ocx/commit/e50c641bc36de3822131bbe44da051283e16af32))

### Release

- V1.2.0 by @michael-herwig ([3b557ac](https://github.com/ocx-sh/setup-ocx/commit/3b557acf1399507e6b6a8db15055715c3e214515))
## [1.1.0](https://github.com/ocx-sh/setup-ocx/releases/tag/v1.1.0) — 2026-05-28

### Added

- Activate project toolchain from ocx.toml and add cross-run cache (**BREAKING**) by @michael-herwig ([02c95b4](https://github.com/ocx-sh/setup-ocx/commit/02c95b48f85416c35298fae4e1bac4580d9dd15a))
- Bootstrap TypeScript / testing / resilience rules + Codecov coverage by @michael-herwig ([c40e0b0](https://github.com/ocx-sh/setup-ocx/commit/c40e0b08cf13576f1180680fff097b3721fe3cfd))
- Rename `toolchain` input/outputs to `project` to match OCX vocabulary (**BREAKING**) by @michael-herwig ([42b1d0c](https://github.com/ocx-sh/setup-ocx/commit/42b1d0ca2df7c4f08b8be4a5dad33a952f796cf8))

### Fixed

- **ci:** Re-resolve nodejs digest from remote and use `ocx version` subcommand by @michael-herwig ([aa2128c](https://github.com/ocx-sh/setup-ocx/commit/aa2128c6b8e7032855c8cd05097bf1652675a307))
- **cache:** Include @actions/tool-cache completion marker in binary cache by @michael-herwig ([5061b91](https://github.com/ocx-sh/setup-ocx/commit/5061b91e3dff3059b0dca067eb095f7771d4b391))

### Release

- V1.1.0 by @michael-herwig ([0a39e58](https://github.com/ocx-sh/setup-ocx/commit/0a39e58f272e7b4e2e46cfa89cdbad2a3578d2cc))
## [1.0.0](https://github.com/ocx-sh/setup-ocx/releases/tag/v1.0.0) — 2026-03-18

### Added

- Initial commit by @michael-herwig ([0abba5d](https://github.com/ocx-sh/setup-ocx/commit/0abba5d24354e6b483484ba1e6ddb26603324d62))

### Release

- V1.0.0 by @michael-herwig ([3bb0f27](https://github.com/ocx-sh/setup-ocx/commit/3bb0f275e1926460a32538851651db7ca098136d))
