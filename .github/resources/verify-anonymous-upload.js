const outcome = process.argv[2];
if (!outcome) {
  console.error("Usage: node verify-anonymous-upload.js <step-outcome>");
  process.exit(1);
}

if (outcome === "failure") {
  console.log("PASS: Anonymous upload correctly failed");
} else {
  console.error("FAIL: Anonymous upload should have failed but succeeded");
  process.exit(1);
}
