import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";

test("requires Cosmos DB configuration for document action storage", async () => {
  process.env.DOCUMENT_ACTION_AZURE_ENABLED = "false";
  delete process.env.AZURE_COSMOS_ENDPOINT;

  const documentAction = await import("../src/documentAction.js?cosmosRequired=true");

  assert.deepEqual(documentAction.getDocumentActionRuntime(), {
    azureEnabled: false,
    documentIntelligenceConfigured: false,
    blobStorageConfigured: false,
    cosmosConfigured: false,
    cosmosAuthMode: "unconfigured",
    storageBackend: "cosmos-unconfigured"
  });

  await assert.rejects(
    () => documentAction.listReminders(),
    /문서 액션 저장소는 Azure Cosmos DB가 필요합니다/
  );
});

test("uses DefaultAzureCredential for Cosmos when only endpoint is configured", async () => {
  process.env.DOCUMENT_ACTION_AZURE_ENABLED = "false";
  process.env.AZURE_COSMOS_ENDPOINT = "https://routinefit-test.documents.azure.com:443/";
  delete process.env.AZURE_COSMOS_KEY;

  const documentAction = await import("../src/documentAction.js?cosmosCliAuth=true");

  assert.deepEqual(documentAction.getDocumentActionRuntime(), {
    azureEnabled: false,
    documentIntelligenceConfigured: false,
    blobStorageConfigured: false,
    cosmosConfigured: true,
    cosmosAuthMode: "default-azure-credential",
    storageBackend: "cosmos"
  });

  delete process.env.AZURE_COSMOS_ENDPOINT;
});

test("keeps required README.md at the repository root", async () => {
  const readmePath = path.resolve(process.cwd(), "..", "README.md");
  await assert.doesNotReject(() => access(readmePath));
});
