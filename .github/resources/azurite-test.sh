#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AZURITE_TMPDIR="/tmp/azurite-test"

show_help() {
  cat <<EOF
Usage: azurite-test.sh <command> [args...]

Commands:
  setup <upload-dir> <container>...      Generate test data, start Azurite HTTPS on port 443, create containers
  teardown                               Kill Azurite, remove /etc/hosts entry, clean up temp files
  verify-sharedkey <container> <dir>     Verify blob list, file content, and yml content-type via Azure SDK
  verify-anonymous <step-outcome>        Verify anonymous upload was rejected (expects "failure")

Environment:
  AZURITE_ACCOUNT   Storage account name (required for setup, teardown, verify-sharedkey)
  AZURITE_KEY       Storage account key (required for setup, verify-sharedkey)
EOF
}

generate_test_data() {
  local dir="$1"
  mkdir -p "$dir/subdir/nested" "$dir/another-subdir"
  echo "Hello from root level" > "$dir/root-file.txt"
  cat > "$dir/config.yml" <<'YAML'
name: test-config
version: 1
YAML
  echo "File inside a subdirectory" > "$dir/subdir/file-in-subdir.txt"
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

  mkdir -p "$AZURITE_TMPDIR"

  openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
    -keyout "$AZURITE_TMPDIR/key.pem" -out "$AZURITE_TMPDIR/cert.pem" \
    -subj "/CN=${hostname}"

  if ! grep -q "127.0.0.1 ${hostname}" /etc/hosts; then
    echo "127.0.0.1 ${hostname}" | sudo tee -a /etc/hosts
  fi

  sudo env "PATH=$PATH" npx azurite-blob \
    --blobHost 0.0.0.0 --blobPort 443 \
    --cert "$AZURITE_TMPDIR/cert.pem" --key "$AZURITE_TMPDIR/key.pem" \
    --location "$AZURITE_TMPDIR" \
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

cmd_setup() {
  local upload_dir="${1:?Usage: azurite-test.sh setup <upload-dir> <container>...}"
  shift
  if [ $# -eq 0 ]; then
    echo "Error: at least one container name is required"
    show_help
    exit 1
  fi
  generate_test_data "$upload_dir"
  setup_azurite
  NODE_TLS_REJECT_UNAUTHORIZED=0 node "$SCRIPT_DIR/create-containers.js" "$@"
}

cmd_teardown() {
  : "${AZURITE_ACCOUNT:?AZURITE_ACCOUNT must be set}"
  local hostname="${AZURITE_ACCOUNT}.blob.core.windows.net"

  if pgrep -f "azurite-blob" > /dev/null 2>&1; then
    sudo pkill -f "azurite-blob" || true
    echo "Azurite stopped"
  fi

  if grep -q "127.0.0.1 ${hostname}" /etc/hosts; then
    sudo sed -i "/127.0.0.1 ${hostname}/d" /etc/hosts
    echo "Removed /etc/hosts entry"
  fi

  if [ -d "$AZURITE_TMPDIR" ]; then
    rm -rf "$AZURITE_TMPDIR"
    echo "Removed $AZURITE_TMPDIR"
  fi
}

cmd_verify_sharedkey() {
  local container="${1:?Usage: azurite-test.sh verify-sharedkey <container> <source-dir>}"
  local source_dir="${2:?Usage: azurite-test.sh verify-sharedkey <container> <source-dir>}"
  : "${AZURITE_ACCOUNT:?AZURITE_ACCOUNT must be set}"
  : "${AZURITE_KEY:?AZURITE_KEY must be set}"
  NODE_TLS_REJECT_UNAUTHORIZED=0 node "$SCRIPT_DIR/verify-sharedkey-uploads.js" "$container" "$source_dir"
}

cmd_verify_anonymous() {
  local outcome="${1:?Usage: azurite-test.sh verify-anonymous <step-outcome>}"
  node "$SCRIPT_DIR/verify-anonymous-upload.js" "$outcome"
}

case "${1:--h}" in
  setup)            shift; cmd_setup "$@" ;;
  teardown)         shift; cmd_teardown "$@" ;;
  verify-sharedkey) shift; cmd_verify_sharedkey "$@" ;;
  verify-anonymous) shift; cmd_verify_anonymous "$@" ;;
  -h|--help)        show_help ;;
  *)                echo "Unknown command: $1"; show_help; exit 1 ;;
esac
