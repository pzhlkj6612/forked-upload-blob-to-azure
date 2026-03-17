const { createBlobServiceClient } = require("./blob-helpers.js");

const account = process.env.AZURITE_ACCOUNT;
const key = process.env.AZURITE_KEY;
const containers = process.argv.slice(2);

Promise.resolve()
  .then(() => {
    if (!account) throw new Error("Missing env: AZURITE_ACCOUNT");
    if (!key) throw new Error("Missing env: AZURITE_KEY");
    if (containers.length === 0) throw new Error("Missing arg: container...");

    const service = createBlobServiceClient(account, key);
    return Promise.all(containers.map((c) => service.getContainerClient(c).create()));
  })
  .then(() => console.log("Containers created"))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
