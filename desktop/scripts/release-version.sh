#!/usr/bin/env bash
# Print the installer version for this checkout (git tag without a leading v).
set -euo pipefail

if [[ "${GITHUB_REF_TYPE:-}" == "tag" && -n "${GITHUB_REF_NAME:-}" ]]; then
  echo "${GITHUB_REF_NAME#v}"
  exit 0
fi

# workflow_dispatch on a branch should not look like a family version.
if [[ -n "${GITHUB_ACTIONS:-}" && "${GITHUB_REF_TYPE:-}" != "tag" ]]; then
  echo "0.0.0-dev"
  exit 0
fi

if command -v git >/dev/null 2>&1; then
  if ver="$(git describe --tags --exact-match 2>/dev/null)"; then
    echo "${ver#v}"
    exit 0
  fi
fi

echo "0.0.0-dev"
