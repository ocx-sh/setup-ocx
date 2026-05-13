# GitLab Function: setup-ocx

This directory packages the OCX installer as a [GitLab CI/CD Function](https://docs.gitlab.com/ci/functions/).
The image is built and published from the gitlab.com mirror at
`gitlab.com/ocx-sh/setup-ocx`, automatically synced from this GitHub repo
on every release tag.

## Files

| File | Purpose |
|---|---|
| `func.yml` | Function spec (inputs/outputs) and `exec:` definition |
| `entrypoint.sh` | Bridges `INPUT_*` env vars to `OCX_INSTALL_*`, runs `install.sh`, emits JSONL outputs |
| `install.sh` | Vendored copy of `../sh/install.sh`. CI checks for drift via `task sync:gitlab` |
| `Dockerfile` | Alpine + curl + tar + xz |
| `.gitlab-ci.yml` | Tag-triggered build + publish + release pipeline (builtin OCI functions) |

## Local development

Build the image locally and exercise `entrypoint.sh` against a fake
release endpoint:

```sh
docker build -t setup-ocx:local gitlab/

OUT=/tmp/ocx-output.jsonl
docker run --rm \
  -e INPUT_VERSION=0.5.0 \
  -e INPUT_SKIP_BOOTSTRAP=true \
  -e OUTPUT_FILE=$OUT \
  -v /tmp:/tmp \
  setup-ocx:local /func/entrypoint.sh

cat $OUT
```

## Sync requirement

`gitlab/install.sh` must match `sh/install.sh` byte-for-byte. The
`verify-installers.yml` workflow fails on drift. After editing
`sh/install.sh`, run:

```sh
task sync:gitlab
```

…and commit both files together.

## Runtime requirements

- GitLab Runner with **step-runner** (GitLab 17.x or later).
- Job container must have a usable shell, but the function image itself
  carries `curl`, `tar`, `xz`, `bash`. No additional packages need to be
  installed in the job's image.

## Catalog publish

The mirror project must have the **CI/CD Catalog resource** flag enabled
under Settings → General → Visibility. This is a one-time manual step.
After that, every tagged release produces a Catalog entry automatically.
