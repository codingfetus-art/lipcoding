import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { randomUUID } from "node:crypto";

/**
 * Azure Blob Storage for keeping the original uploaded document.
 *
 * Auth:
 *   - AZURE_STORAGE_CONNECTION_STRING (key-based), or
 *   - AZURE_STORAGE_ACCOUNT with Managed Identity (DefaultAzureCredential).
 * When neither is configured, uploads are skipped and no URL is returned.
 */

const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "documents";

export function isBlobConfigured(): boolean {
  return Boolean(
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
      process.env.AZURE_STORAGE_ACCOUNT,
  );
}

let cachedClient: BlobServiceClient | null = null;

function getClient(): BlobServiceClient {
  if (cachedClient) return cachedClient;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (conn) {
    cachedClient = BlobServiceClient.fromConnectionString(conn);
  } else {
    const account = process.env.AZURE_STORAGE_ACCOUNT!;
    cachedClient = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      new DefaultAzureCredential(),
    );
  }
  return cachedClient;
}

/**
 * Upload a document buffer and return its blob URL.
 * Returns undefined if Blob Storage is not configured or upload fails.
 */
export async function uploadDocument(
  buffer: Buffer,
  fileName: string,
  contentType: string,
): Promise<string | undefined> {
  if (!isBlobConfigured()) return undefined;
  try {
    const service = getClient();
    const container = service.getContainerClient(CONTAINER);
    await container.createIfNotExists();
    const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
    const blobName = `${randomUUID()}${ext}`;
    const block = container.getBlockBlobClient(blobName);
    await block.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return block.url;
  } catch (err) {
    console.error("[blob] upload failed:", err);
    return undefined;
  }
}
