import { InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';

/**
 * Saves arbitrary JSON-serializable data to Blob Storage under
 * `${folderPrefix}/${data.id}.json`.
 */
export async function saveToBlob(
  blobServiceClient: BlobServiceClient,
  containerName: string,
  folderPrefix: string,
  data: any,
  context: InvocationContext
): Promise<void> {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    const blobName = `${folderPrefix}/${data.id}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const content = JSON.stringify(data, null, 2);
    await blockBlobClient.upload(content, content.length);
  } catch (err) {
    context.error('Failed to upload to blob storage', err);
    throw err;
  }
}
