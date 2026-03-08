// Verify that an anonymous (no-credential) upload was correctly rejected.
//
// Usage: node verify-anon-upload.js <step-outcome>

const outcome = process.argv[2];
if (!outcome) {
  console.error("Usage: node verify-anon-upload.js <step-outcome>");
  process.exit(1);
}

if (outcome === "failure") {
  console.log("PASS: Anonymous upload correctly failed");
} else {
  console.error("FAIL: Anonymous upload should have failed but succeeded");
  process.exit(1);
}
