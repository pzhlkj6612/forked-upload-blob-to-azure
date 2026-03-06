#!/usr/bin/env bash
set -euo pipefail

# Create test containers in Azurite.
#
# Required env: AZURITE_ACCOUNT, AZURITE_KEY
# Arguments: container names to create

: "${AZURITE_ACCOUNT:?AZURITE_ACCOUNT must be set}"
: "${AZURITE_KEY:?AZURITE_KEY must be set}"

CONTAINERS=("$@")
if [ ${#CONTAINERS[@]} -eq 0 ]; then
  echo "Usage: create-containers.sh <container1> [container2] ..."
  exit 1
fi

# Pass container names as a JSON array via env var
CONTAINERS_JSON=$(printf '%s\n' "${CONTAINERS[@]}" | jq -R . | jq -s .)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

NODE_TLS_REJECT_UNAUTHORIZED=0 \
  CONTAINERS="$CONTAINERS_JSON" \
  node "$SCRIPT_DIR/create-containers.js"
