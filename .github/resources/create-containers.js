const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");

const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
if (!account || !key) {
  console.error("AZURITE_ACCOUNT and AZURITE_KEY must be set");
  process.exit(1);
}

const containers = process.argv.slice(2);
if (containers.length === 0) {
  console.error("Usage: node create-containers.js <container1> [container2] ...");
  process.exit(1);
}

const cred = new StorageSharedKeyCredential(account, key);
const svc = new BlobServiceClient(
  "https://" + account + ".blob.core.windows.net",
  cred
);

Promise.all(containers.map((c) => svc.getContainerClient(c).create()))
  .then(() => console.log("Containers created"))
  .catch((err) => {
    console.error("Failed to create containers:", err.message);
    process.exit(1);
  });
