/**
 * Document text extraction (OCR) abstraction.
 *
 * MVP: if no Azure Document Intelligence credentials are configured, we do NOT
 * OCR locally. Instead the caller either:
 *   - passes the document text directly (user paste), or
 *   - attaches the image to the Copilot session so the model can read it.
 *
 * Production: when configured, this calls Azure AI Document Intelligence
 * (prebuilt-receipt / prebuilt-invoice) for accurate structured extraction.
 */

import {
  DocumentAnalysisClient,
  AzureKeyCredential,
} from "@azure/ai-form-recognizer";
import { DefaultAzureCredential } from "@azure/identity";

export interface ExtractedDocument {
  /** Raw text content extracted from the document, if available. */
  text: string;
  /** Where the extraction came from. */
  source: "azure-document-intelligence" | "client-text" | "none";
}

export function isDocumentIntelligenceConfigured(): boolean {
  return Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT);
}

let cachedClient: DocumentAnalysisClient | null = null;

function getClient(): DocumentAnalysisClient {
  if (cachedClient) return cachedClient;
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT!;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  // Key auth when a key is provided, otherwise Managed Identity on Azure.
  cachedClient = key
    ? new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key))
    : new DocumentAnalysisClient(endpoint, new DefaultAzureCredential());
  return cachedClient;
}

/**
 * Extract text from an uploaded document buffer.
 *
 * When Document Intelligence is not configured, returns an empty result so the
 * agent path falls back to attaching the image for the model to read directly.
 */
export async function extractDocument(
  buffer: Buffer,
  _contentType: string,
): Promise<ExtractedDocument> {
  if (!isDocumentIntelligenceConfigured()) {
    return { text: "", source: "none" };
  }

  try {
    const client = getClient();
    // prebuilt-receipt is tuned for receipts; it also returns full OCR content,
    // which we forward to the agent for classification and field extraction.
    const poller = await client.beginAnalyzeDocument("prebuilt-receipt", buffer);
    const result = await poller.pollUntilDone();
    const text = result.content ?? "";
    return { text, source: "azure-document-intelligence" };
  } catch (err) {
    console.error("[ocr] Document Intelligence failed:", err);
    return { text: "", source: "none" };
  }
}

