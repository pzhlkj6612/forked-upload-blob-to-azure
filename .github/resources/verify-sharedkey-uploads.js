const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
const fs = require("fs");
const path = require("path");

const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
if (!account || !key) {
  console.error("AZURITE_ACCOUNT and AZURITE_KEY must be set");
  process.exit(1);
}

const containerName = process.argv[2];
const sourceDir = process.argv[3];
if (!containerName || !sourceDir) {
  console.error("Usage: node verify-sharedkey-uploads.js <container> <source-dir>");
  process.exit(1);
}

function walkDir(dir, base, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      walkDir(path.join(dir, entry.name), rel, results);
    } else {
      results.push(rel);
    }
  }
  return results;
}

const expected = walkDir(sourceDir, "", []).sort();

const cred = new StorageSharedKeyCredential(account, key);
const svc = new BlobServiceClient(
  "https://" + account + ".blob.core.windows.net",
  cred
);
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
