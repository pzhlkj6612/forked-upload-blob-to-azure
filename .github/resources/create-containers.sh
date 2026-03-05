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

NODE_TLS_REJECT_UNAUTHORIZED=0 CONTAINERS="$CONTAINERS_JSON" node -e "
  const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
  const account = process.env.AZURITE_ACCOUNT;
  const key = process.env.AZURITE_KEY;
  const containers = JSON.parse(process.env.CONTAINERS);
  const cred = new StorageSharedKeyCredential(account, key);
  const svc = new BlobServiceClient('https://' + account + '.blob.core.windows.net', cred);
  Promise.all(containers.map(c => svc.getContainerClient(c).create()))
    .then(() => console.log('Containers created'));
"
