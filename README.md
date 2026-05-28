<div align="center">

<img src="./assets/logo.svg" width="192" />

# setup-ocx

**GitHub Action to install the [OCX](https://github.com/ocx-sh/ocx) package manager**

[![CI][ci-badge]][ci]
[![Coverage][codecov-badge]][codecov]
[![License][license-badge]][license]

</div>

## Usage

Drop the action into your workflow. When the repository contains an `ocx.toml`
the action installs OCX, pre-warms the object store from `ocx.lock`, and puts
every locked tool on `PATH` — subsequent steps can invoke `bun`, `node`,
`go-task`, etc. directly.

```yaml
- uses: ocx-sh/setup-ocx@v1
- run: bun install
- run: bun test
```

### Inputs

| Input               | Description                                                                                                    | Default                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `version`           | OCX version to install (`"latest"` or exact like `"0.3.1"`)                                                    | `latest`                  |
| `github-token`      | GitHub token for API requests and release downloads                                                            | `${{ github.token }}`     |
| `libc`              | Linux C library variant (`"gnu"` or `"musl"`). Auto-detected if not set.                                       |                           |
| `project`           | Path to the project `ocx.toml` (relative to `working-directory`). Set to `''` to disable project auto-load.    | `ocx.toml`                |
| `working-directory` | Directory used to resolve `project` and invoke ocx.                                                            | `${{ github.workspace }}` |
| `groups`            | Comma-separated list of project groups to pre-warm via `ocx pull -g`. Empty pulls every entry from `ocx.lock`. |                           |
| `cache`             | Cache the OCX object store (`$OCX_HOME/{blobs,layers,packages,tags}`) and the ocx binary itself across runs.   | `true`                    |
| `cache-suffix`      | Extra string appended to cache keys for manual busting.                                                        |                           |
| `ocx-home`          | Overrides `$OCX_HOME`.                                                                                         | `~/.ocx`                  |

### Outputs

| Output              | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `version`           | The installed OCX version                                             |
| `ocx-path`          | Path to the OCX binary directory                                      |
| `cache-hit`         | Whether the OCX binary was restored from cache                        |
| `project-loaded`    | Whether an OCX project was found and activated (`"true"` / `"false"`) |
| `project-cache-hit` | Whether the OCX object store was restored from cache for this project |

### Examples

**Project mode (recommended):**

Commit `ocx.toml` + `ocx.lock` to the repo, then:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: ocx-sh/setup-ocx@v1
  - run: bun install # tools from ocx.toml are on PATH automatically
  - run: bun test
```

**Binary-only mode (no project):**

```yaml
steps:
  - uses: ocx-sh/setup-ocx@v1
    with:
      project: "" # explicit opt-out — only the ocx binary is installed
  - run: ocx package exec nodejs:24 -- node --version
```

**Pin OCX version and restrict to a group:**

```yaml
steps:
  - uses: ocx-sh/setup-ocx@v1
    with:
      version: "0.3.1"
      groups: ci
```

**Force musl binary (Alpine containers):**

```yaml
steps:
  - uses: ocx-sh/setup-ocx@v1
    with:
      libc: musl
```

### Caching

The action caches two things via [`@actions/cache`](https://github.com/actions/toolkit/tree/main/packages/cache):

1. **OCX binary** — keyed on the resolved Rust target triple + version
   (`setup-ocx-bin-<target>-<version>`). Restored before download, saved
   in the post step on miss.
2. **OCX object store** — `$OCX_HOME/{blobs,layers,packages,tags}`, keyed on
   `os/arch/libc + ocx version + sha256(ocx.lock)`. The volatile
   `symlinks/`, `projects/`, `state/`, `temp/` directories are excluded —
   they are regenerated on demand by `ocx pull` / `ocx env`.

Set `cache: false` to disable both. Use `cache-suffix` to force a fresh
cache without changing `ocx.lock`.

### Permissions

The action only needs read access to GitHub releases (the default
`${{ github.token }}` is sufficient on public repos). For private mirrors,
pass an explicit `github-token`.

```yaml
permissions:
  contents: read
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. Quick start:

```sh
git clone https://github.com/ocx-sh/setup-ocx.git
cd setup-ocx
direnv allow        # activates the toolchain locally via .envrc
task install        # install dependencies
task test           # run unit tests
task check          # test + build + verify dist
```

## Community

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## License

setup-ocx is licensed under the [Apache License, Version 2.0][license].

<!-- badges -->

[ci]: https://github.com/ocx-sh/setup-ocx/actions/workflows/verify-basic.yml
[ci-badge]: https://github.com/ocx-sh/setup-ocx/actions/workflows/verify-basic.yml/badge.svg
[codecov]: https://codecov.io/gh/ocx-sh/setup-ocx
[codecov-badge]: https://codecov.io/gh/ocx-sh/setup-ocx/branch/main/graph/badge.svg
[license]: LICENSE
[license-badge]: https://img.shields.io/badge/license-Apache--2.0-blue.svg
