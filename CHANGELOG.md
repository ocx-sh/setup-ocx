# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0](https://github.com/ocx-sh/setup-ocx/releases/tag/v1.1.0) — 2026-05-28

### Added

- Activate project toolchain from ocx.toml and add cross-run cache (**BREAKING**) by @michael-herwig ([02c95b4](https://github.com/ocx-sh/setup-ocx/commit/02c95b48f85416c35298fae4e1bac4580d9dd15a))
- Bootstrap TypeScript / testing / resilience rules + Codecov coverage by @michael-herwig ([c40e0b0](https://github.com/ocx-sh/setup-ocx/commit/c40e0b08cf13576f1180680fff097b3721fe3cfd))
- Rename `toolchain` input/outputs to `project` to match OCX vocabulary (**BREAKING**) ([42b1d0c](https://github.com/ocx-sh/setup-ocx/commit/42b1d0ca2df7c4f08b8be4a5dad33a952f796cf8))

### Fixed

- **ci:** Re-resolve nodejs digest from remote and use `ocx version` subcommand by @michael-herwig ([aa2128c](https://github.com/ocx-sh/setup-ocx/commit/aa2128c6b8e7032855c8cd05097bf1652675a307))
- **cache:** Include @actions/tool-cache completion marker in binary cache by @michael-herwig ([5061b91](https://github.com/ocx-sh/setup-ocx/commit/5061b91e3dff3059b0dca067eb095f7771d4b391))

## [1.0.0](https://github.com/ocx-sh/setup-ocx/releases/tag/v1.0.0) — 2026-03-18

### Added

- Initial commit ([0abba5d](https://github.com/ocx-sh/setup-ocx/commit/0abba5d24354e6b483484ba1e6ddb26603324d62))
