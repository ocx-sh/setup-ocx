#!/bin/sh
# build-gitlab-export.sh — produce a clean tree mirroring this repo to
# gitlab.com/ocx-sh/setup-ocx. The exported tree is what gets pushed
# (single commit per release) onto the GitLab `main` branch.
#
# Usage:
#   scripts/build-gitlab-export.sh [output-dir]
#
# Includes: gitlab/, sh/, pwsh/, LICENSE, CONTRIBUTING.md, CHANGELOG.md,
#           CODE_OF_CONDUCT.md, SECURITY.md, README_GITLAB.md (renamed → README.md)
# Excludes: src/, dist/, tests/, action.yml, .github/, package.json,
#           bun.lock, tsconfig.json, .claude/, assets/, taskfile.yml,
#           cliff.toml, original README.md, esbuild config, etc.

set -eu

SRC=$(git rev-parse --show-toplevel)
OUT="${1:-_gitlab-export}"

# Make OUT absolute
case "$OUT" in
    /*) ;;
    *) OUT="$PWD/$OUT" ;;
esac

rm -rf "$OUT"
mkdir -p "$OUT"

cp -r "$SRC/gitlab" "$OUT/"
cp -r "$SRC/sh"     "$OUT/"
cp -r "$SRC/pwsh"   "$OUT/"

# The Dockerfile + func.yml + install.sh + entrypoint.sh need to be at
# the project root for GitLab's builtin OCI build to find them with
# `context: .`. Promote gitlab/ contents up.
mv "$OUT/gitlab/Dockerfile"    "$OUT/Dockerfile"
mv "$OUT/gitlab/func.yml"      "$OUT/func.yml"
mv "$OUT/gitlab/entrypoint.sh" "$OUT/entrypoint.sh"
mv "$OUT/gitlab/install.sh"    "$OUT/install.sh"
mv "$OUT/gitlab/.gitlab-ci.yml" "$OUT/.gitlab-ci.yml"
# README from gitlab/ is contributor-facing; the user-facing README is
# README_GITLAB.md from the repo root.
rm -f "$OUT/gitlab/README.md"
rmdir "$OUT/gitlab" 2>/dev/null || true

for f in LICENSE CONTRIBUTING.md CHANGELOG.md CODE_OF_CONDUCT.md SECURITY.md; do
    [ -f "$SRC/$f" ] && cp "$SRC/$f" "$OUT/$f"
done

if [ -f "$SRC/README_GITLAB.md" ]; then
    cp "$SRC/README_GITLAB.md" "$OUT/README.md"
else
    echo "build-gitlab-export: warning: README_GITLAB.md missing; GitLab repo will have no README" >&2
fi

echo "build-gitlab-export: tree at $OUT"
ls -la "$OUT"
