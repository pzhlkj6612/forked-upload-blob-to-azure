// Verify blobs uploaded via SharedKey authentication.
// Checks: blob list, file content, yml content-type headers.
//
// Required env: AZURITE_ACCOUNT, AZURITE_KEY, VERIFY_CONTAINER,
//               VERIFY_SOURCE_DIR, VERIFY_EXPECTED (JSON array)

const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
const fs = require("fs");
const path = require("path");

const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
const cred = new StorageSharedKeyCredential(account, key);
const svc = new BlobServiceClient(
  "https://" + account + ".blob.core.windows.net",
  cred
);
const container = svc.getContainerClient(process.env.VERIFY_CONTAINER);
const sourceDir = process.env.VERIFY_SOURCE_DIR;
const expected = JSON.parse(process.env.VERIFY_EXPECTED);

(async () => {
  // Verify all expected blobs exist
  const blobs = [];
  for await (const b of container.listBlobsFlat()) blobs.push(b.name);
  blobs.sort();
  expected.sort();
  console.log("Found blobs:", blobs);
  console.log("Expected:   ", expected);
  if (JSON.stringify(blobs) !== JSON.stringify(expected)) {
    console.error("FAIL: blob list mismatch");
    process.exit(1);
  }

  // Verify content of each blob matches the source file
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

  // Verify yml content-type
  for (const blobName of blobs.filter((b) => b.endsWith(".yml"))) {
    const props = await container.getBlobClient(blobName).getProperties();
    if (props.contentType !== "text/x-yaml") {
      console.error(
        "FAIL:",
        blobName,
        "content-type is",
        props.contentType,
        "expected text/x-yaml"
      );
      process.exit(1);
    }
  }

  console.log("PASS: All SharedKey upload verifications succeeded");
})();
