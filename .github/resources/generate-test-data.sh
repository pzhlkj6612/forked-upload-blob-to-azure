#!/usr/bin/env bash
set -euo pipefail

# Generate test upload directory with nested sub-directories for exercising
# recursive traversal in the action.
#
# Usage: generate-test-data.sh <output-dir>

DIR="${1:?Usage: generate-test-data.sh <output-dir>}"

mkdir -p "$DIR/subdir/nested" "$DIR/another-subdir"

echo "Hello from root level"            > "$DIR/root-file.txt"
echo -e "name: test-config\nversion: 1" > "$DIR/config.yml"
echo "File inside a subdirectory"       > "$DIR/subdir/file-in-subdir.txt"

echo '{"key": "value", "nested": true}' > "$DIR/subdir/nested/deep-file.json"

cat > "$DIR/another-subdir/data.yml" <<'YAML'
items:
  - name: item1
  - name: item2
YAML

echo "Test data generated in $DIR"
