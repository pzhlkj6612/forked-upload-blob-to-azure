const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
const fs = require("fs");
const path = require("path");

function createBlobServiceClient(account, key) {
  const url = "https://" + account + ".blob.core.windows.net";
  if (key) {
    return new BlobServiceClient(url, new StorageSharedKeyCredential(account, key));
  }
  return new BlobServiceClient(url);
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

module.exports = { createBlobServiceClient, walkDir };
