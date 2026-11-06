#!/usr/bin/env bash
# Local Docker build mirroring the GitHub Actions docker-build.yml workflow.
# Builds linux/amd64 (add ,linux/arm64 for multi-arch, requires QEMU).
# Pushes to Docker Hub: kristofkeppens/sam
#
# Usage:
#   ./docker-build.sh              # derives tag from package.json version
#   ./docker-build.sh 1.2.3-rc.1  # override tag explicitly
#   ./docker-build.sh --no-push    # build only, skip push

set -euo pipefail

REPO="kristofkeppens/sam"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Help ──────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: ./docker-build.sh [TAG] [OPTIONS]

Build the SAM Docker image locally, mirroring the GitHub Actions workflow.
Targets linux/amd64. Requires Docker Buildx and an active Docker Hub login.

Arguments:
  TAG           Image tag to use (e.g. 1.2.3-rc.1).
                Defaults to the version in package.json.

Options:
  --no-push     Build and load the image locally; do not push to Docker Hub.
  -h, --help    Show this help message and exit.

Examples:
  ./docker-build.sh                  # tag from package.json, build & push
  ./docker-build.sh 1.2.3-rc.1       # explicit tag, build & push
  ./docker-build.sh --no-push        # build only, load to local daemon
  ./docker-build.sh 1.2.3 --no-push  # explicit tag, no push

Output image(s):
  $REPO:<TAG>
  $REPO:latest
EOF
  exit 0
}

# ── Parse args ────────────────────────────────────────────────────────────────
NO_PUSH=false
OVERRIDE_TAG=""

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage ;;
    --no-push) NO_PUSH=true ;;
    *)         OVERRIDE_TAG="$arg" ;;
  esac
done

# ── Derive version tag ────────────────────────────────────────────────────────
if [[ -n "$OVERRIDE_TAG" ]]; then
  VERSION="$OVERRIDE_TAG"
else
  VERSION=$(node -p "require('./package.json').version" 2>/dev/null || true)
  if [[ -z "$VERSION" ]]; then
    echo "Error: could not read version from package.json" >&2
    exit 1
  fi
fi

echo "Building $REPO:$VERSION (linux/amd64)"
echo ""

# ── Build (and optionally push) ───────────────────────────────────────────────
PUSH_FLAG="--load"
if [[ "$NO_PUSH" == "false" ]]; then
  PUSH_FLAG="--push"
fi

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXTAUTH_SECRET=build-time-placeholder-not-used-at-runtime \
  --build-arg NEXTAUTH_URL=http://localhost:3000 \
  --build-arg NEXT_TELEMETRY_DISABLED=1 \
  --tag "$REPO:$VERSION" \
  --tag "$REPO:latest" \
  $PUSH_FLAG \
  "$SCRIPT_DIR"

echo ""
if [[ "$NO_PUSH" == "true" ]]; then
  echo "Build complete (not pushed). Local tags:"
else
  echo "Build complete. Pushed:"
fi
echo "  $REPO:$VERSION"
echo "  $REPO:latest"
