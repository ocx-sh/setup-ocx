#!/bin/sh
# entrypoint.sh — bridges GitLab Function inputs/outputs to install.sh.
# GLF inputs arrive as INPUT_<UPPER> env vars. Outputs are JSONL lines in $OUTPUT_FILE.

set -eu

# Map GLF inputs → install.sh env vars (only when non-empty).
[ -n "${INPUT_BASE_URL:-}" ]            && export OCX_INSTALL_BASE_URL="$INPUT_BASE_URL"
[ -n "${INPUT_API_URL:-}" ]             && export OCX_INSTALL_API_URL="$INPUT_API_URL"
[ -n "${INPUT_FORMAT_URL:-}" ]          && export OCX_INSTALL_FORMAT_URL="$INPUT_FORMAT_URL"
[ -n "${INPUT_CHECKSUM_FORMAT_URL:-}" ] && export OCX_INSTALL_CHECKSUM_FORMAT_URL="$INPUT_CHECKSUM_FORMAT_URL"
[ -n "${INPUT_REPO:-}" ]                && export OCX_INSTALL_REPO="$INPUT_REPO"
[ -n "${INPUT_GITHUB_TOKEN:-}" ]        && export GITHUB_TOKEN="$INPUT_GITHUB_TOKEN"
[ "${INPUT_SKIP_BOOTSTRAP:-false}" = "true" ] && export OCX_INSTALL_SKIP_BOOTSTRAP=1

# CI defaults: never edit profiles, keep stderr clean, capture path on stdout.
export OCX_NO_MODIFY_PATH=1
export OCX_INSTALL_QUIET=1
export OCX_INSTALL_PRINT_PATH=1

VERSION_ARG=""
case "${INPUT_VERSION:-latest}" in
    '' | latest) ;;
    *) VERSION_ARG="--version ${INPUT_VERSION}" ;;
esac

# install.sh prints the bin dir on its last stdout line when PRINT_PATH=1.
# shellcheck disable=SC2086  # VERSION_ARG is a deliberate two-token expansion.
BIN_DIR=$(./install.sh $VERSION_ARG | tail -n1)

if [ -z "$BIN_DIR" ] || [ ! -x "$BIN_DIR/ocx" ]; then
    echo "entrypoint: install.sh did not yield a usable bin dir (got: $BIN_DIR)" >&2
    exit 1
fi

RESOLVED=$("$BIN_DIR/ocx" version 2>/dev/null | awk '{print $NF; exit}')
[ -z "$RESOLVED" ] && RESOLVED="${INPUT_VERSION:-unknown}"

# JSON-escape a string (path or version). No external deps.
json_escape() {
    printf '%s' "$1" | awk '{
        gsub(/\\/, "\\\\");
        gsub(/"/, "\\\"");
        gsub(/\t/, "\\t");
        gsub(/\r/, "\\r");
        gsub(/\n/, "\\n");
        printf "\"%s\"", $0
    }'
}

OUT="${OUTPUT_FILE:?OUTPUT_FILE is not set; step-runner must provide it}"
{
    printf '{"name":"version","value":%s}\n' "$(json_escape "$RESOLVED")"
    printf '{"name":"path","value":%s}\n'    "$(json_escape "$BIN_DIR")"
} >>"$OUT"
