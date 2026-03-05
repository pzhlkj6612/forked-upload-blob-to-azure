import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlobServiceClient, StorageSharedKeyCredential, ContainerClient } from '@azure/storage-blob';
import { join } from 'path';
import { readFileSync } from 'fs';
import { uploadBlobs, readdirRecursive } from '../src/index';

const AZURITE_ACCOUNT = 'devstoreaccount1';
const AZURITE_KEY = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
const AZURITE_BLOB_ENDPOINT = `http://127.0.0.1:10000/${AZURITE_ACCOUNT}`;
const AZURITE_CONNECTION_STRING = `DefaultEndpointsProtocol=http;AccountName=${AZURITE_ACCOUNT};AccountKey=${AZURITE_KEY};BlobEndpoint=${AZURITE_BLOB_ENDPOINT};`;

const TEST_DIR = join(__dirname, 'fixtures', 'test-upload-dir');

// Expected files in the test fixture directory (relative paths with forward slashes)
const EXPECTED_BLOBS = [
  'root-file.txt',
  'config.yml',
  'subdir/file-in-subdir.txt',
  'subdir/nested/deep-file.json',
  'another-subdir/data.yml',
].sort();

/** Helper: list all blob names in a container */
async function listBlobNames(containerClient: ContainerClient): Promise<string[]> {
  const names: string[] = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    names.push(blob.name);
  }
  return names.sort();
}

/** Helper: download a blob's content as a string */
async function downloadBlobContent(containerClient: ContainerClient, blobName: string): Promise<string> {
  const blobClient = containerClient.getBlobClient(blobName);
  const response = await blobClient.download();
  const chunks: Buffer[] = [];
  for await (const chunk of response.readableStreamBody!) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

describe('readdirRecursive', () => {
  it('should find all files recursively including subdirectories', async () => {
    const files = await readdirRecursive(TEST_DIR);
    const relative = files.map(f => f.replace(TEST_DIR + '/', '')).sort();
    expect(relative).toEqual(EXPECTED_BLOBS);
  });
});

describe('uploadBlobs with Azurite', () => {
  let adminServiceClient: BlobServiceClient;

  beforeAll(() => {
    adminServiceClient = BlobServiceClient.fromConnectionString(AZURITE_CONNECTION_STRING);
  });

  describe('SharedKeyCredential authentication', () => {
    const containerName = 'test-sharedkey';
    let containerClient: ContainerClient;

    beforeAll(async () => {
      containerClient = adminServiceClient.getContainerClient(containerName);
      await containerClient.createIfNotExists();
    });

    afterAll(async () => {
      await containerClient.deleteIfExists();
    });

    it('should upload all files including those in subdirectories', async () => {
      await uploadBlobs({
        account: AZURITE_ACCOUNT,
        container: containerName,
        directory: TEST_DIR,
        accountKey: AZURITE_KEY,
        blobEndpoint: AZURITE_BLOB_ENDPOINT,
      });

      const blobNames = await listBlobNames(containerClient);
      expect(blobNames).toEqual(EXPECTED_BLOBS);
    });

    it('should upload correct file contents', async () => {
      const content = await downloadBlobContent(containerClient, 'root-file.txt');
      expect(content).toBe('Hello from root level\n');

      const jsonContent = await downloadBlobContent(containerClient, 'subdir/nested/deep-file.json');
      expect(JSON.parse(jsonContent)).toEqual({ key: 'value', nested: true });
    });

    it('should set content-type for yml files', async () => {
      const blobClient = containerClient.getBlobClient('config.yml');
      const properties = await blobClient.getProperties();
      expect(properties.contentType).toBe('text/x-yaml');

      const nestedYml = containerClient.getBlobClient('another-subdir/data.yml');
      const nestedProps = await nestedYml.getProperties();
      expect(nestedProps.contentType).toBe('text/x-yaml');
    });
  });

  describe('Connection string authentication', () => {
    const containerName = 'test-connstring';
    let containerClient: ContainerClient;

    beforeAll(async () => {
      containerClient = adminServiceClient.getContainerClient(containerName);
      await containerClient.createIfNotExists();
    });

    afterAll(async () => {
      await containerClient.deleteIfExists();
    });

    it('should upload all files using connection string', async () => {
      await uploadBlobs({
        account: AZURITE_ACCOUNT,
        container: containerName,
        directory: TEST_DIR,
        connectionString: AZURITE_CONNECTION_STRING,
      });

      const blobNames = await listBlobNames(containerClient);
      expect(blobNames).toEqual(EXPECTED_BLOBS);
    });

    it('should upload correct file contents via connection string', async () => {
      const content = await downloadBlobContent(containerClient, 'another-subdir/data.yml');
      const expected = readFileSync(join(TEST_DIR, 'another-subdir', 'data.yml'), 'utf-8');
      expect(content).toBe(expected);
    });
  });

  describe('AnonymousCredential authentication', () => {
    const containerName = 'test-anonymous';
    let containerClient: ContainerClient;

    beforeAll(async () => {
      containerClient = adminServiceClient.getContainerClient(containerName);
      await containerClient.createIfNotExists();
    });

    afterAll(async () => {
      await containerClient.deleteIfExists();
    });

    it('should fail to upload with anonymous credentials', async () => {
      await expect(
        uploadBlobs({
          account: AZURITE_ACCOUNT,
          container: containerName,
          directory: TEST_DIR,
          blobEndpoint: AZURITE_BLOB_ENDPOINT,
          // No accountKey or connectionString → AnonymousCredential
        }),
      ).rejects.toThrow();
    });
  });
});
