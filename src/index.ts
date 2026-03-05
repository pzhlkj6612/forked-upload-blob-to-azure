import { getInput, info, setFailed } from '@actions/core';
import { ClientSecretCredential } from "@azure/identity";
import { AnonymousCredential, BlockBlobClient, BlockBlobUploadOptions, StorageSharedKeyCredential } from '@azure/storage-blob';
import { createReadStream } from 'fs';
import { readdir, stat } from "fs/promises";
import { join, relative } from 'path';

async function readdirRecursive(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  const result: string[] = [];
  await Promise.all(files.map(async (fileName) => {
    const filePath = join(dir, fileName);
    const fileStat = await stat(filePath);

    if (fileStat.isDirectory()) {
      result.push(...await readdirRecursive(filePath));
    } else {
      result.push(filePath);
    }
  }));
  return result;
}


async function run() {
  try {
    const account = getInput('account', { required: true });
    const container = getInput('container', { required: true });
    const dir = getInput('directory', { required: true });

    const accountKey = process.env.AZURE_ACCOUNT_KEY;
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    let credit: StorageSharedKeyCredential | AnonymousCredential | ClientSecretCredential;
    if (typeof accountKey === 'string') {
      credit = new StorageSharedKeyCredential(account, accountKey);
      info('Found and use SharedKeyCredential (accountKey)');
    } else if (typeof tenantId === 'string' && typeof clientId === 'string' && typeof clientSecret === 'string') {
      credit = new ClientSecretCredential(tenantId, clientId, clientSecret);
      info('Found and use ClientSecretCredential (tenantId, clientId, clientSecret)');
    } else {
      credit = new AnonymousCredential();
      info('Not found any credential. Use AnonymousCredential. If you want assign credential, please assign env variable AZURE_ACCOUNT_KEY (your storage account key) or AZURE_STORAGE_TOKEN (your storage token)');
    }
    const files = await readdirRecursive(dir);

    await Promise.all(files.map(async (filePath) => {
      let relativePath = relative(dir, filePath).replaceAll('\\', '/');
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
      const fileStat = await stat(filePath);

      const options: BlockBlobUploadOptions = {
        blobHTTPHeaders: {
        },
      };
      if (relativePath.endsWith("yml")) { // if the file is the yml file use yml format
        options.blobHTTPHeaders!.blobContentType = 'text/x-yaml';
      }
      const client = new BlockBlobClient(`https://${account}.blob.core.windows.net/${container}/${relativePath}`, credit)
      info(`Upload ${relativePath}`);

      await client.upload(() => createReadStream(filePath),
        fileStat.size,
        options);
    }));
  } catch (error) {
    console.error(error)
    setFailed((error as any).message);
  }
}

if (require.main === module) {
  run();
}