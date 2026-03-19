const { createBlobServiceClient } = require("./blob-helpers.js");

const account = process.env.AZURITE_ACCOUNT;
const containerName = process.argv[2];

Promise.resolve()
  .then(async () => {
    if (!account) throw new Error("Missing env: AZURITE_ACCOUNT");
    if (!containerName) throw new Error("Missing arg: container");

    const service = createBlobServiceClient(account);
    const container = service.getContainerClient(containerName);

    const blobs = [];
    for await (const b of container.listBlobsFlat()) blobs.push(b.name);
    throw new Error("Anonymous access should have been rejected but listed " + blobs.length + " blobs");
  })
  .catch((err) => {
    if (err.statusCode === 403 || err.statusCode === 401) {
      console.log("PASS: Anonymous access correctly rejected:", err.message);
      return;
    }
    console.error("FAIL:", err.message);
    process.exitCode = 1;
  });
