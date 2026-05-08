#!/usr/bin/env bash
set -euo pipefail

repo_url="${1:-$(git config --get remote.origin.url)}"
workdir="$(mktemp -d "${TMPDIR:-/tmp}/orch8-solana-smoke.XXXXXX")"

cleanup() {
  rm -rf "$workdir"
}
trap cleanup EXIT

echo "Fresh-clone smoke test"
echo "======================"
echo "repo=$repo_url"
echo "workdir=$workdir"

git clone "$repo_url" "$workdir/orch8-solana"
cd "$workdir/orch8-solana"

npm install
npm run check
npm run demo:solana-wow

echo "Fresh-clone smoke test passed"
