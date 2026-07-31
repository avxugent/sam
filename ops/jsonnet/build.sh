#!/usr/bin/env bash
# Build Grafana dashboard JSON from jsonnet into the Ansible role's files/ dir.
#
#   ops/jsonnet/build.sh
#
# The built JSON is committed. CI must run this and fail on a dirty tree:
#
#   ops/jsonnet/build.sh && git diff --exit-code ops/ansible/roles/grafana_sam/files/dashboards
#
# That is what makes "recreate the dashboards at any time" verifiable rather than
# aspirational — it proves the committed JSON is what the source produces.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$here/../ansible/roles/grafana_sam/files/dashboards"

command -v jsonnet >/dev/null || {
  echo "jsonnet not found. Install go-jsonnet:" >&2
  echo "  https://github.com/google/go-jsonnet/releases" >&2
  exit 1
}

mkdir -p "$out"

for src in "$here"/dashboards/*.jsonnet; do
  name="$(basename "$src" .jsonnet)"
  dest="$out/sam-$name.json"
  jsonnet "$src" -o "$dest"
  echo "built $dest"
done
