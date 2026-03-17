<div align="center">

<img src="./assets/logo.svg" width="192" />

# setup-ocx

**GitHub Action to install the [OCX](https://github.com/ocx-sh/ocx) package manager**

[![CI][ci-badge]][ci]
[![License][license-badge]][license]

</div>

## Usage

```yaml
- uses: ocx-sh/setup-ocx@v1
  with:
    version: latest
```

### Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `version` | OCX version to install (`"latest"` or exact like `"0.2.0"`) | `latest` |
| `github-token` | GitHub token for API requests and release downloads | `${{ github.token }}` |
| `libc` | Linux C library variant (`"gnu"` or `"musl"`). Auto-detected if not set. | |

### Outputs

| Output | Description |
|--------|-------------|
| `version` | The installed OCX version |
| `ocx-path` | Path to the OCX binary directory |
| `cache-hit` | Whether the binary was restored from cache |

### Examples

**Install latest version:**

```yaml
steps:
  - uses: ocx-sh/setup-ocx@v1
  - run: ocx install cmake:3.28
```

**Pin a specific version:**

```yaml
steps:
  - uses: ocx-sh/setup-ocx@v1
    with:
      version: '0.2.0'
```

**Force musl binary (e.g., for Alpine containers):**

```yaml
steps:
  - uses: ocx-sh/setup-ocx@v1
    with:
      version: latest
      libc: musl
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. Quick start:

```sh
git clone https://github.com/ocx-sh/setup-ocx.git
cd setup-ocx
task install       # install dependencies
task test          # run unit tests
task check         # test + build + verify dist
```

## Community

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## License

setup-ocx is licensed under the [Apache License, Version 2.0][license].

<!-- badges -->
[ci]: https://github.com/ocx-sh/setup-ocx/actions/workflows/verify-basic.yml
[ci-badge]: https://github.com/ocx-sh/setup-ocx/actions/workflows/verify-basic.yml/badge.svg
[license]: LICENSE
[license-badge]: https://img.shields.io/badge/license-Apache--2.0-blue.svg
