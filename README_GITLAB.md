# setup-ocx — GitLab Function

Install the [OCX package manager](https://ocx.sh) in a GitLab CI job.

This is the GitLab mirror of [`ocx-sh/setup-ocx`](https://github.com/ocx-sh/setup-ocx)
on GitHub. Source of truth, issues, and pull requests live there. Every
release on GitHub publishes a [GitLab Function](https://docs.gitlab.com/ci/functions/)
OCI image to this project's container registry and creates a release in
the [CI/CD Catalog](https://docs.gitlab.com/ci/components/).

## Usage

```yaml
build:
  run:
    - name: setup-ocx
      func: registry.gitlab.com/ocx-sh/setup-ocx/setup-ocx:1.0.0
      inputs:
        version: 0.5.0
    - name: build-app
      script: ocx exec nodejs:24 -- npm ci && npm run build
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `version` | `latest` | OCX version (e.g. `0.5.0`). |
| `libc` | _auto_ | `gnu` or `musl`. Auto-detected from the job container. |
| `base_url` | _empty_ | Override release-asset base URL (corporate mirrors). |
| `api_url` | _empty_ | Override "latest" lookup URL. |
| `format_url` | _empty_ | URL template, placeholders `{version}`, `{tag}`, `{target}`, `{ext}`. |
| `checksum_format_url` | _empty_ | Checksum-file URL template (same placeholders). |
| `repo` | `ocx-sh/ocx` | GitHub `owner/repo` for default URL composition. |
| `skip_bootstrap` | `false` | Skip `ocx --remote install` (offline / air-gapped installs). |
| `github_token` | _empty_ | Forwarded as `GITHUB_TOKEN` to avoid API rate limits. |

## Outputs

| Output | Description |
|---|---|
| `version` | The installed OCX version (resolved from `latest` if applicable). |
| `path` | Absolute path to the OCX bin directory. |

## Corporate mirror example

For an Artifactory / Nexus mirror with a non-GitHub layout:

```yaml
build:
  run:
    - name: setup-ocx
      func: registry.gitlab.com/ocx-sh/setup-ocx/setup-ocx:1.0.0
      inputs:
        version: 0.5.0
        format_url: 'https://artifactory.corp/ocx/{version}/{target}/ocx-{target}.{ext}'
        checksum_format_url: 'https://artifactory.corp/ocx/{version}/{target}/sha256.sum'
        skip_bootstrap: true
```

`skip_bootstrap: true` keeps the function self-contained — no calls to
the public `ocx.sh` registry. The installer drops the binary into the
canonical `~/.ocx/symlinks/.../current/bin` location.

## Air-gapped / self-hosted mirror

To run this function from your own GitLab Container Registry mirror:

1. Pull the upstream image: `docker pull registry.gitlab.com/ocx-sh/setup-ocx/setup-ocx:1.0.0`
2. Re-tag and push to your registry:
   `docker tag ... registry.your-corp/setup-ocx:1.0.0 && docker push ...`
3. Reference the local image in `func:`.

## Source

Canonical repository: https://github.com/ocx-sh/setup-ocx
