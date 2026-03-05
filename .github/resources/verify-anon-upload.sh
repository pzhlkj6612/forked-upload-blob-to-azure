#!/usr/bin/env bash
set -euo pipefail

# Verify that an anonymous (no-credential) upload was correctly rejected.
#
# Arguments: <step-outcome>  (the outcome from the action step)

OUTCOME="${1:?Usage: verify-anon-upload.sh <step-outcome>}"

if [ "$OUTCOME" = "failure" ]; then
  echo "PASS: Anonymous upload correctly failed"
else
  echo "FAIL: Anonymous upload should have failed but succeeded"
  exit 1
fi
