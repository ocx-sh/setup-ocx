<div align="center">

<img src="./assets/logo.svg" width="192" />

# setup-ocx

**Install the [OCX](https://github.com/ocx-sh/ocx) package manager in any CI environment**

[![CI][ci-badge]][ci]
[![License][license-badge]][license]

</div>

This repository ships three install surfaces from a single source of truth:

| Surface | Use it when... |
|---|---|
| **GitHub Action** (this README) | Your pipeline runs on GitHub Actions |
| **GitLab Function** ([README_GITLAB.md](./README_GITLAB.md)) | Your pipeline runs on GitLab CI |
| **Shell installers** ([`sh/install.sh`](./sh/install.sh), [`pwsh/install.ps1`](./pwsh/install.ps1)) | Anything else: Dockerfile `RUN`, Ansible, k8s init container, manual install |

The shell installers are the canonical install logic; the GLF wraps them in an OCI image; the GHA is a parallel TypeScript implementation that integrates with `@actions/tool-cache`.

---

## GitHub Actions usage

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
  - run: ocx exec ocx.sh/corretto:25 -- java --version
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

---

## Standalone shell installers

```sh
# Latest:
curl -fsSL https://setup.ocx.sh/sh | sh
irm https://setup.ocx.sh/pwsh | iex

# Pinned:
curl -fsSL https://setup.ocx.sh/sh/1.0.0/install.sh | sh
irm https://setup.ocx.sh/pwsh/1.0.0/install.ps1 | iex
```

### CI / mirror-friendly env knobs

| Env var | Default | Purpose |
|---|---|---|
| `OCX_INSTALL_REPO` | `ocx-sh/ocx` | Owner/repo for default URL composition |
| `OCX_INSTALL_BASE_URL` | derived | Release-asset base URL (`https://github.com/$REPO/releases/download`) |
| `OCX_INSTALL_API_URL` | derived | Release-list API URL (latest version lookup) |
| `OCX_INSTALL_FORMAT_URL` | derived | Template with `{version}`, `{tag}`, `{target}`, `{ext}` placeholders |
| `OCX_INSTALL_CHECKSUM_FORMAT_URL` | derived | Same template, for `sha256.sum` |
| `OCX_INSTALL_SKIP_BOOTSTRAP` | `0` | `1` = skip `ocx --remote install` (offline / air-gapped installs) |
| `OCX_INSTALL_PRINT_PATH` | `0` | `1` = emit absolute bin dir on the final stdout line |
| `OCX_INSTALL_FORCE` | `0` | `1` = reinstall even if same version is present |
| `OCX_INSTALL_QUIET` | `0` | `1` = suppress informational logs (warnings + errors remain on stderr) |
| `OCX_INSTALL_NO_BIN_SMOKETEST` | `0` | `1` = skip post-extract `$bin version` check (cross-arch installs) |
| `OCX_INSTALL_DOWNLOADER` | auto | Force `curl` or `wget` |

### Stdout / stderr contract (v2)

- All informational/warning/error messages go to **stderr**.
- **stdout** is silent on success unless `OCX_INSTALL_PRINT_PATH=1`, in which case the **final stdout line** is the absolute OCX bin dir. This makes the installers usable from `BIN=$(curl … | sh)` patterns.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 2 | Argument or environment validation |
| 3 | Network / download / API failure |
| 4 | Checksum mismatch |
| 5 | Archive extraction failure |
| 6 | Bootstrap failure |
| 7 | Unsupported platform / architecture |

---

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. Quick start:

```sh
git clone https://github.com/ocx-sh/setup-ocx.git
cd setup-ocx
task install              # install TS deps
task test                 # run TS unit tests
task lint:sh              # shellcheck
task test:install:sh      # bats env-knob tests against fixture HTTP server
task check                # TS test + build + verify dist
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
