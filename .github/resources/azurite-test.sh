#!/usr/bin/env bash
set -euo pipefail

# All-in-one CI test script for Azurite black-box testing.
#
# Subcommands:
#   setup <upload-dir>                          Generate test data, start Azurite, create containers
#   verify-sharedkey <container> <source-dir>   Verify SharedKey uploads (blob list, content, yml content-type)
#   verify-anonymous <step-outcome>             Verify anonymous upload was rejected

COMMAND="${1:?Usage: azurite-test.sh <setup|verify-sharedkey|verify-anonymous> ...}"
shift

case "$COMMAND" in

  setup)
    UPLOAD_DIR="${1:?Usage: azurite-test.sh setup <upload-dir>}"
    : "${AZURITE_ACCOUNT:?AZURITE_ACCOUNT must be set}"
    : "${AZURITE_KEY:?AZURITE_KEY must be set}"

    HOSTNAME="${AZURITE_ACCOUNT}.blob.core.windows.net"

    # --- Generate test data ---
    mkdir -p "$UPLOAD_DIR/subdir/nested" "$UPLOAD_DIR/another-subdir"

    echo "Hello from root level"            > "$UPLOAD_DIR/root-file.txt"
    printf "name: test-config\nversion: 1\n" > "$UPLOAD_DIR/config.yml"
    echo "File inside a subdirectory"       > "$UPLOAD_DIR/subdir/file-in-subdir.txt"

    echo '{"key": "value", "nested": true}' > "$UPLOAD_DIR/subdir/nested/deep-file.json"

    cat > "$UPLOAD_DIR/another-subdir/data.yml" <<'YAML'
items:
  - name: item1
  - name: item2
YAML

    echo "Test data generated in $UPLOAD_DIR"

    # --- Setup Azurite HTTPS ---
    openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
      -keyout /tmp/azurite-key.pem -out /tmp/azurite-cert.pem \
      -subj "/CN=${HOSTNAME}"

    echo "127.0.0.1 ${HOSTNAME}" | sudo tee -a /etc/hosts

    sudo env "PATH=$PATH" npx azurite-blob \
      --blobHost 0.0.0.0 --blobPort 443 \
      --cert /tmp/azurite-cert.pem --key /tmp/azurite-key.pem \
      --loose --silent &

    for i in $(seq 1 10); do
      if curl -sk -o /dev/null -w '' "https://${HOSTNAME}/" 2>/dev/null; then
        echo "Azurite is ready"
        break
      fi
      echo "Waiting for Azurite... ($i)"
      sleep 1
      if [ "$i" -eq 10 ]; then
        echo "Azurite failed to start"
        exit 1
      fi
    done

    # --- Create containers ---
    NODE_TLS_REJECT_UNAUTHORIZED=0 node - container-sharedkey test-anonymous <<'JS'
const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
const cred = new StorageSharedKeyCredential(account, key);
const svc = new BlobServiceClient("https://" + account + ".blob.core.windows.net", cred);
Promise.all(process.argv.slice(1).map((c) => svc.getContainerClient(c).create()))
  .then(() => console.log("Containers created"))
  .catch((err) => { console.error("Failed to create containers:", err.message); process.exit(1); });
JS
    ;;

  verify-sharedkey)
    CONTAINER="${1:?Usage: azurite-test.sh verify-sharedkey <container> <source-dir>}"
    SOURCE_DIR="${2:?Usage: azurite-test.sh verify-sharedkey <container> <source-dir>}"
    : "${AZURITE_ACCOUNT:?AZURITE_ACCOUNT must be set}"
    : "${AZURITE_KEY:?AZURITE_KEY must be set}"

    NODE_TLS_REJECT_UNAUTHORIZED=0 node - "$CONTAINER" "$SOURCE_DIR" <<'JS'
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
  console.log("Found blobs:", blobs);
  console.log("Expected:   ", expected);
  if (JSON.stringify(blobs) !== JSON.stringify(expected)) {
    console.error("FAIL: blob list mismatch");
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
    ;;

  verify-anonymous)
    OUTCOME="${1:?Usage: azurite-test.sh verify-anonymous <step-outcome>}"

    if [ "$OUTCOME" = "failure" ]; then
      echo "PASS: Anonymous upload correctly failed"
    else
      echo "FAIL: Anonymous upload should have failed but succeeded"
      exit 1
    fi
    ;;

  *)
    echo "Unknown command: $COMMAND"
    echo "Usage: azurite-test.sh <setup|verify-sharedkey|verify-anonymous> ..."
    exit 1
    ;;
esac
