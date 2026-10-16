#!/usr/bin/env bash
# Lint and type check the site. CI runs this inside `nix develop`.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$script_dir")"

if command -v prek >/dev/null; then
  prek run --all-files --show-diff-on-failure
  exit 0
fi

pnpm lint
pnpm typecheck
