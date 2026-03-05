import { getInput, info, setFailed } from '@actions/core';
import { AnonymousCredential, BlobServiceClient, BlockBlobUploadOptions, StorageSharedKeyCredential } from '@azure/storage-blob';
import { createReadStream } from 'fs';
import { readdir, stat } from "fs/promises";
import { join, relative } from 'path';

export async function readdirRecursive(dir: string): Promise<string[]> {
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

export interface UploadConfig {
  account: string;
  container: string;
  directory: string;
  connectionString?: string;
  accountKey?: string;
  blobEndpoint?: string;
}

export async function uploadBlobs(config: UploadConfig): Promise<void> {
  const { account, container, directory } = config;
  const blobEndpoint = config.blobEndpoint || `https://${account}.blob.core.windows.net`;

  let serviceClient: BlobServiceClient;

  if (config.connectionString) {
    serviceClient = BlobServiceClient.fromConnectionString(config.connectionString);
    info('Using connection string for authentication');
  } else if (config.accountKey) {
    const credential = new StorageSharedKeyCredential(account, config.accountKey);
    serviceClient = new BlobServiceClient(blobEndpoint, credential);
    info('Using SharedKeyCredential (accountKey)');
  } else {
    serviceClient = new BlobServiceClient(blobEndpoint, new AnonymousCredential());
    info('Using AnonymousCredential');
  }

  const containerClient = serviceClient.getContainerClient(container);
  const files = await readdirRecursive(directory);

  await Promise.all(files.map(async (filePath) => {
    let relativePath = relative(directory, filePath).replaceAll('\\', '/');
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
    const blobClient = containerClient.getBlockBlobClient(relativePath);
    info(`Upload ${relativePath}`);

    await blobClient.upload(() => createReadStream(filePath),
      fileStat.size,
      options);
  }));
}

async function run() {
  try {
    const account = getInput('account', { required: true });
    const container = getInput('container', { required: true });
    const dir = getInput('directory', { required: true });

    await uploadBlobs({
      account,
      container,
      directory: dir,
      connectionString: process.env.AZURE_CONNECTION_STRING,
      accountKey: process.env.AZURE_ACCOUNT_KEY,
    });
  } catch (error) {
    console.error(error)
    setFailed((error as any).message);
  }
}

if (require.main === module) {
  run();
}