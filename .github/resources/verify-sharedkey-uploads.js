const { createBlobServiceClient, walkDir } = require("./blob-helpers.js");
const fs = require("fs");
const path = require("path");

const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
const containerName = process.argv[2];
const sourceDir = process.argv[3];

Promise.resolve()
  .then(async () => {
    if (!account || !key) throw new Error("AZURITE_ACCOUNT and AZURITE_KEY must be set");
    if (!containerName || !sourceDir) throw new Error("Usage: node verify-sharedkey-uploads.js <container> <source-dir>");

    const expected = walkDir(sourceDir, "", []).sort();
    const svc = createBlobServiceClient(account, key);
    const container = svc.getContainerClient(containerName);

    const blobs = [];
    for await (const b of container.listBlobsFlat()) blobs.push(b.name);
    blobs.sort();
    if (JSON.stringify(blobs) !== JSON.stringify(expected)) {
      throw new Error("Blob list mismatch.\nFound: " + JSON.stringify(blobs) + "\nExpected: " + JSON.stringify(expected));
    }

    for (const blobName of blobs) {
      const dl = await container.getBlobClient(blobName).download();
      const chunks = [];
      for await (const c of dl.readableStreamBody) chunks.push(c);
      const blobContent = Buffer.concat(chunks).toString();
      const fileContent = fs.readFileSync(path.join(sourceDir, blobName), "utf8");
      if (blobContent !== fileContent) {
        throw new Error("Content mismatch for " + blobName);
      }
    }

    for (const blobName of blobs.filter((b) => b.endsWith(".yml"))) {
      const props = await container.getBlobClient(blobName).getProperties();
      if (props.contentType !== "text/x-yaml") {
        throw new Error(blobName + " content-type is " + props.contentType + ", expected text/x-yaml");
      }
    }
  })
  .then(() => console.log("PASS: All SharedKey upload verifications succeeded"))
  .catch((err) => {
    console.error("FAIL:", err.message);
    process.exitCode = 1;
    throw err;
  });
