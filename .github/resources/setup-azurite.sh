#!/usr/bin/env bash
set -euo pipefail

# Set up Azurite blob service with HTTPS on port 443.
# The action hardcodes https://<account>.blob.core.windows.net URLs, so we:
#   1. Generate a self-signed cert for the hostname
#   2. Map the hostname to 127.0.0.1 via /etc/hosts
#   3. Start Azurite on port 443 with HTTPS
#   4. Wait for readiness
#
# Required env: AZURITE_ACCOUNT

: "${AZURITE_ACCOUNT:?AZURITE_ACCOUNT must be set}"

HOSTNAME="${AZURITE_ACCOUNT}.blob.core.windows.net"

# Generate self-signed cert
openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
  -keyout /tmp/azurite-key.pem -out /tmp/azurite-cert.pem \
  -subj "/CN=${HOSTNAME}"

# Route the hostname to localhost
echo "127.0.0.1 ${HOSTNAME}" | sudo tee -a /etc/hosts

# Start Azurite blob service on port 443 with HTTPS
sudo env "PATH=$PATH" npx azurite-blob \
  --blobHost 0.0.0.0 --blobPort 443 \
  --cert /tmp/azurite-cert.pem --key /tmp/azurite-key.pem \
  --loose --silent &

# Wait for Azurite to be ready
for i in $(seq 1 10); do
  if curl -sk -o /dev/null -w '' "https://${HOSTNAME}/" 2>/dev/null; then
    echo "Azurite is ready"
    exit 0
  fi
  echo "Waiting for Azurite... ($i)"
  sleep 1
done

echo "Azurite failed to start"
exit 1
