#!/usr/bin/env bash
# lint-staged hook for Go files. Formats the staged files and lints their
# packages. Exits 0 when Go is not installed so non-Go contributors can commit.
# lint-staged passes absolute paths (Windows-style under Git Bash), so every
# path is converted to a repository-relative one before use.
set -euo pipefail

if ! command -v go >/dev/null 2>&1; then
  exit 0
fi
if [ "$#" -eq 0 ]; then
  exit 0
fi

to_unix() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$1"
  else
    printf '%s\n' "$1"
  fi
}

root="$(to_unix "$(git rev-parse --show-toplevel)")"
cd "$root"

files=()
for f in "$@"; do
  files+=("$(realpath --relative-to="$root" "$(to_unix "$f")")")
done

gofmt -l -w "${files[@]}"

if command -v golangci-lint >/dev/null 2>&1; then
  pkgs=$(for f in "${files[@]}"; do printf './%s/...\n' "$(dirname "$f")"; done | sort -u)
  # shellcheck disable=SC2086 -- intentional word splitting of package patterns
  golangci-lint run --fix $pkgs
fi
