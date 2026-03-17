const { createBlobServiceClient } = require("./blob-helpers.js");

const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
const containers = process.argv.slice(2);

Promise.resolve()
  .then(() => {
    if (!account || !key) throw new Error("AZURITE_ACCOUNT and AZURITE_KEY must be set");
    if (containers.length === 0) throw new Error("Usage: node create-containers.js <container1> [container2] ...");
    const svc = createBlobServiceClient(account, key);
    return Promise.all(containers.map((c) => svc.getContainerClient(c).create()));
  })
  .then(() => console.log("Containers created"))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
