// Generate test upload directory with nested sub-directories for exercising
// recursive traversal in the action.
//
// Usage: node generate-test-data.js <output-dir>

const fs = require("fs");
const path = require("path");

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node generate-test-data.js <output-dir>");
  process.exit(1);
}

fs.mkdirSync(path.join(dir, "subdir", "nested"), { recursive: true });
fs.mkdirSync(path.join(dir, "another-subdir"), { recursive: true });

fs.writeFileSync(path.join(dir, "root-file.txt"), "Hello from root level\n");
fs.writeFileSync(
  path.join(dir, "config.yml"),
  "name: test-config\nversion: 1\n"
);
fs.writeFileSync(
  path.join(dir, "subdir", "file-in-subdir.txt"),
  "File inside a subdirectory\n"
);
fs.writeFileSync(
  path.join(dir, "subdir", "nested", "deep-file.json"),
  '{"key": "value", "nested": true}\n'
);
fs.writeFileSync(
  path.join(dir, "another-subdir", "data.yml"),
  "items:\n  - name: item1\n  - name: item2\n"
);

console.log("Test data generated in", dir);
