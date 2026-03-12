#!/usr/bin/env bash
set -euo pipefail

show_help() {
  cat <<EOF
Usage: azurite-test.sh <command> [args...]

Commands:
  setup <upload-dir>                     Generate test data, start Azurite HTTPS on port 443, create containers
  verify-sharedkey <container> <dir>     Verify blob list, file content, and yml content-type via Azure SDK
  verify-anonymous <step-outcome>        Verify anonymous upload was rejected (expects "failure")

Environment:
  AZURITE_ACCOUNT   Storage account name (required for setup, verify-sharedkey)
  AZURITE_KEY       Storage account key (required for setup, verify-sharedkey)
EOF
}

generate_test_data() {
  local dir="$1"
  mkdir -p "$dir/subdir/nested" "$dir/another-subdir"
  echo "Hello from root level"            > "$dir/root-file.txt"
  printf "name: test-config\nversion: 1\n" > "$dir/config.yml"
  echo "File inside a subdirectory"       > "$dir/subdir/file-in-subdir.txt"
  echo '{"key": "value", "nested": true}' > "$dir/subdir/nested/deep-file.json"
  cat > "$dir/another-subdir/data.yml" <<'YAML'
items:
  - name: item1
  - name: item2
YAML
  echo "Test data generated in $dir"
}

setup_azurite() {
  : "${AZURITE_ACCOUNT:?AZURITE_ACCOUNT must be set}"
  : "${AZURITE_KEY:?AZURITE_KEY must be set}"
  local hostname="${AZURITE_ACCOUNT}.blob.core.windows.net"

  openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
    -keyout /tmp/azurite-key.pem -out /tmp/azurite-cert.pem \
    -subj "/CN=${hostname}"

  echo "127.0.0.1 ${hostname}" | sudo tee -a /etc/hosts

  sudo env "PATH=$PATH" npx azurite-blob \
    --blobHost 0.0.0.0 --blobPort 443 \
    --cert /tmp/azurite-cert.pem --key /tmp/azurite-key.pem \
    --loose --silent &

  for i in $(seq 1 10); do
    if curl -sk -o /dev/null -w '' "https://${hostname}/" 2>/dev/null; then
      echo "Azurite is ready"
      return 0
    fi
    echo "Waiting for Azurite... ($i)"
    sleep 1
  done

  echo "Azurite failed to start"
  return 1
}

create_containers() {
  NODE_TLS_REJECT_UNAUTHORIZED=0 node - "$@" <<'JS'
const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
const cred = new StorageSharedKeyCredential(account, key);
const svc = new BlobServiceClient("https://" + account + ".blob.core.windows.net", cred);
const containers = process.argv.slice(1);
Promise.all(containers.map((c) => svc.getContainerClient(c).create()))
  .then(() => console.log("Containers created"))
  .catch((err) => { console.error("Failed:", err.message); process.exit(1); });
JS
}

cmd_setup() {
  local upload_dir="${1:?Usage: azurite-test.sh setup <upload-dir>}"
  generate_test_data "$upload_dir"
  setup_azurite
  create_containers container-sharedkey test-anonymous
}

cmd_verify_sharedkey() {
  local container="${1:?Usage: azurite-test.sh verify-sharedkey <container> <source-dir>}"
  local source_dir="${2:?Usage: azurite-test.sh verify-sharedkey <container> <source-dir>}"
  : "${AZURITE_ACCOUNT:?AZURITE_ACCOUNT must be set}"
  : "${AZURITE_KEY:?AZURITE_KEY must be set}"

  NODE_TLS_REJECT_UNAUTHORIZED=0 node - "$container" "$source_dir" <<'JS'
const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
const fs = require("fs");
const path = require("path");
const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
const containerName = process.argv[1];
const sourceDir = process.argv[2];

function walkDir(dir, base, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) walkDir(path.join(dir, entry.name), rel, results);
    else results.push(rel);
  }
  return results;
}

const expected = walkDir(sourceDir, "", []).sort();
const cred = new StorageSharedKeyCredential(account, key);
const svc = new BlobServiceClient("https://" + account + ".blob.core.windows.net", cred);
const container = svc.getContainerClient(containerName);

(async () => {
  const blobs = [];
  for await (const b of container.listBlobsFlat()) blobs.push(b.name);
  blobs.sort();
  if (JSON.stringify(blobs) !== JSON.stringify(expected)) {
    console.error("FAIL: blob list mismatch");
    console.error("Found:", blobs);
    console.error("Expected:", expected);
    process.exit(1);
  }

  for (const blobName of blobs) {
    const dl = await container.getBlobClient(blobName).download();
    const chunks = [];
    for await (const c of dl.readableStreamBody) chunks.push(c);
    const blobContent = Buffer.concat(chunks).toString();
    const fileContent = fs.readFileSync(path.join(sourceDir, blobName), "utf8");
    if (blobContent !== fileContent) {
      console.error("FAIL: content mismatch for", blobName);
      process.exit(1);
    }
  }

  for (const blobName of blobs.filter((b) => b.endsWith(".yml"))) {
    const props = await container.getBlobClient(blobName).getProperties();
    if (props.contentType !== "text/x-yaml") {
      console.error("FAIL:", blobName, "content-type is", props.contentType, "expected text/x-yaml");
      process.exit(1);
    }
  }

  console.log("PASS: All SharedKey upload verifications succeeded");
})();
JS
}

cmd_verify_anonymous() {
  local outcome="${1:?Usage: azurite-test.sh verify-anonymous <step-outcome>}"
  if [ "$outcome" = "failure" ]; then
    echo "PASS: Anonymous upload correctly failed"
  else
    echo "FAIL: Anonymous upload should have failed but outcome was '$outcome'"
    exit 1
  fi
}

case "${1:--h}" in
  setup)            shift; cmd_setup "$@" ;;
  verify-sharedkey) shift; cmd_verify_sharedkey "$@" ;;
  verify-anonymous) shift; cmd_verify_anonymous "$@" ;;
  -h|--help)        show_help ;;
  *)                echo "Unknown command: $1"; show_help; exit 1 ;;
esac
