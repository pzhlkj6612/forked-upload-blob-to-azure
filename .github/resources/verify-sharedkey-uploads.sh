#!/usr/bin/env bash
set -euo pipefail

# Verify blobs uploaded via SharedKey authentication.
# Checks: blob list, file content, yml content-type headers.
#
# Required env: AZURITE_ACCOUNT, AZURITE_KEY
# Arguments: <container-name> <source-directory>

: "${AZURITE_ACCOUNT:?AZURITE_ACCOUNT must be set}"
: "${AZURITE_KEY:?AZURITE_KEY must be set}"
CONTAINER="${1:?Usage: verify-sharedkey-uploads.sh <container> <source-dir>}"
SOURCE_DIR="${2:?Usage: verify-sharedkey-uploads.sh <container> <source-dir>}"

# Build the expected blob list from the source directory
EXPECTED=$(cd "$SOURCE_DIR" && find . -type f | sed 's|^\./||' | sort | jq -R . | jq -s .)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

NODE_TLS_REJECT_UNAUTHORIZED=0 \
  VERIFY_CONTAINER="$CONTAINER" \
  VERIFY_SOURCE_DIR="$SOURCE_DIR" \
  VERIFY_EXPECTED="$EXPECTED" \
  node "$SCRIPT_DIR/verify-sharedkey-uploads.js"
