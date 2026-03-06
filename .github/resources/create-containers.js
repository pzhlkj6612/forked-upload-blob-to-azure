// Create test containers in Azurite.
//
// Required env: AZURITE_ACCOUNT, AZURITE_KEY, CONTAINERS (JSON array of names)

const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");

const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
const containers = JSON.parse(process.env.CONTAINERS);

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
