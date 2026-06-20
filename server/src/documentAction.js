import { createHash, randomUUID } from "node:crypto";
import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";

const DEMO_USER = "demo-user";
const DOCUMENT_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "documents";

let documentClient = null;
let blobClient = null;
let cosmosClient = null;
let expensesContainer = null;
let remindersContainer = null;

export function getDocumentActionRuntime() {
  const azureEnabled = isAzureDocumentActionEnabled();
  return {
    azureEnabled,
    documentIntelligenceConfigured: isDocumentIntelligenceConfigured(),
    blobStorageConfigured: isBlobConfigured(),
    cosmosConfigured: isCosmosConfigured(),
    cosmosAuthMode: getCosmosAuthMode(),
    storageBackend: isCosmosConfigured() ? "cosmos" : "cosmos-unconfigured"
  };
}

export async function processDocumentAction({ text = "", file = null, fileName = "" }) {
  const steps = [];
  let sourceUrl;
  let extractedText = "";

  if (file) {
    sourceUrl = await uploadDocument(file.buffer, file.originalname, file.mimetype, steps);
    extractedText = await extractDocumentText(file.buffer, steps);
  }

  const documentText = [text.trim(), extractedText.trim()].filter(Boolean).join("\n\n");
  const fallbackName = file?.originalname || fileName;

  if (!documentText && !fallbackName) {
    throw new Error("문서 텍스트 또는 파일 정보가 필요합니다.");
  }
  if (file && !extractedText && !text.trim()) {
    steps.push("Azure OCR 설정이 없거나 추출에 실패해 파일명을 기준으로 처리했습니다.");
  }

  const sourceText = documentText || `첨부 파일명: ${fallbackName}`;
  const documentType = classifyDocument(sourceText, fallbackName);
  steps.unshift(`문서 분류: ${documentTypeLabel(documentType)}`);
  steps.push("핵심 필드 추출");

  if (documentType === "receipt") {
    const { record: expense, created } = await saveExpense(
      buildExpenseRecord(sourceText, fallbackName, sourceUrl)
    );
    steps.push(
      created
        ? `지출 기록 저장: ${expense.merchant} ${expense.total.toLocaleString("ko-KR")}원`
        : `중복 지출 감지: 기존 기록 재사용 (${expense.merchant} ${expense.total.toLocaleString("ko-KR")}원)`
    );

    return {
      documentType,
      summary: created
        ? `**${expense.merchant}** 지출 ${expense.total.toLocaleString("ko-KR")}원을 **${expense.category}** 카테고리로 기록했습니다.`
        : `이미 저장된 **${expense.merchant}** 지출 기록을 재사용했습니다.`,
      expense,
      duplicate: !created,
      steps
    };
  }

  if (documentType === "bill") {
    const { record: reminder, created } = await saveReminder(
      buildReminder(sourceText, fallbackName, sourceUrl)
    );
    steps.push(
      created
        ? `리마인드 등록: ${reminder.title} (${reminder.dueDate})`
        : `중복 리마인드 감지: 기존 일정 재사용 (${reminder.title} ${reminder.dueDate})`
    );

    return {
      documentType,
      summary: created
        ? `**${reminder.title}** 마감일을 **${reminder.dueDate}**로 등록했습니다.`
        : `이미 저장된 **${reminder.title}** 마감일 **${reminder.dueDate}**를 재사용했습니다.`,
      reminder,
      duplicate: !created,
      steps
    };
  }

  if (documentType === "contract") {
    const { record: reminder, created } = await saveReminder(
      buildContractReminder(sourceText, fallbackName, sourceUrl)
    );
    const draftMessage = [
      "안녕하세요.",
      "계약 만기 및 주요 조건 확인을 위해 연락드립니다.",
      "계약 종료 또는 갱신 의사 확인이 필요한 일정이 있어 검토 부탁드립니다.",
      "감사합니다."
    ].join("\n");
    steps.push(
      created
        ? `계약 리마인드 등록: ${reminder.title}`
        : `중복 계약 리마인드 감지: 기존 일정 재사용 (${reminder.title})`
    );
    steps.push("확인 요청 초안 작성");

    return {
      documentType,
      summary: created
        ? `계약 문서에서 **${reminder.title}** 일정을 찾아 리마인드와 확인 요청 초안을 만들었습니다.`
        : `이미 저장된 계약 리마인드 **${reminder.title}**를 재사용하고 확인 요청 초안을 만들었습니다.`,
      reminder,
      draftMessage,
      duplicate: !created,
      steps
    };
  }

  return {
    documentType,
    summary: "문서를 기타 유형으로 분류했습니다. 금액, 마감일, 계약 기간 같은 명확한 단서가 있으면 더 구체적으로 처리할 수 있습니다.",
    steps
  };
}

export async function listExpenses() {
  const { expenses } = await getCosmosContainers();
  const { resources } = await expenses.items
    .query({
      query: "SELECT * FROM c WHERE c.userId = @userId",
      parameters: [{ name: "@userId", value: DEMO_USER }]
    })
    .fetchAll();
  return resources;
}

export async function listReminders() {
  const { reminders } = await getCosmosContainers();
  const { resources } = await reminders.items
    .query({
      query: "SELECT * FROM c WHERE c.userId = @userId",
      parameters: [{ name: "@userId", value: DEMO_USER }]
    })
    .fetchAll();
  return resources;
}

export async function getExpenseSummary() {
  const expenses = await listExpenses();
  const byCategory = {};
  const total = expenses.reduce((sum, expense) => {
    byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.total;
    return sum + expense.total;
  }, 0);

  return {
    total,
    byCategory,
    count: expenses.length
  };
}

async function saveExpense(record) {
  const { expenses } = await getCosmosContainers();
  return saveCosmosRecord(expenses, record, "expense");
}

async function saveReminder(reminder) {
  const { reminders } = await getCosmosContainers();
  return saveCosmosRecord(reminders, reminder, "reminder");
}

function isDocumentIntelligenceConfigured() {
  return isAzureDocumentActionEnabled() && Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT);
}

function isBlobConfigured() {
  return (
    isAzureDocumentActionEnabled() &&
    Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_ACCOUNT)
  );
}

function isCosmosConfigured() {
  return Boolean(process.env.AZURE_COSMOS_ENDPOINT);
}

function isAzureDocumentActionEnabled() {
  return process.env.DOCUMENT_ACTION_AZURE_ENABLED === "true";
}

function getCosmosAuthMode() {
  if (!isCosmosConfigured()) {
    return "unconfigured";
  }
  return process.env.AZURE_COSMOS_KEY ? "key" : "default-azure-credential";
}

function getDocumentClient() {
  if (documentClient) {
    return documentClient;
  }

  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  documentClient = key
    ? new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key))
    : new DocumentAnalysisClient(endpoint, new DefaultAzureCredential());
  return documentClient;
}

async function extractDocumentText(buffer, steps) {
  if (!isDocumentIntelligenceConfigured()) {
    return "";
  }

  const model = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL || "prebuilt-read";
  try {
    const poller = await getDocumentClient().beginAnalyzeDocument(model, buffer);
    const result = await poller.pollUntilDone();
    steps.push(`Azure Document Intelligence OCR 적용: ${model}`);
    return result.content || "";
  } catch (error) {
    steps.push(`Azure Document Intelligence OCR 실패: ${error.message}`);
    return "";
  }
}

function getBlobClient() {
  if (blobClient) {
    return blobClient;
  }

  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    blobClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    return blobClient;
  }

  blobClient = new BlobServiceClient(
    `https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
    new DefaultAzureCredential()
  );
  return blobClient;
}

async function uploadDocument(buffer, fileName, contentType, steps) {
  if (!isBlobConfigured()) {
    return undefined;
  }

  try {
    const container = getBlobClient().getContainerClient(DOCUMENT_CONTAINER);
    await container.createIfNotExists();
    const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
    const blobName = `${randomUUID()}${extension}`;
    const blockBlob = container.getBlockBlobClient(blobName);
    await blockBlob.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType || "application/octet-stream" }
    });
    steps.push("Azure Blob Storage에 원본 문서 저장");
    return blockBlob.url;
  } catch (error) {
    steps.push(`Azure Blob Storage 저장 실패: ${error.message}`);
    return undefined;
  }
}

function getCosmosClient() {
  if (cosmosClient) {
    return cosmosClient;
  }

  const key = process.env.AZURE_COSMOS_KEY;
  cosmosClient = key
    ? new CosmosClient({ endpoint: process.env.AZURE_COSMOS_ENDPOINT, key })
    : new CosmosClient({
        endpoint: process.env.AZURE_COSMOS_ENDPOINT,
        aadCredentials: new DefaultAzureCredential()
      });
  return cosmosClient;
}

async function getCosmosContainers() {
  ensureCosmosConfigured();

  if (expensesContainer && remindersContainer) {
    return { expenses: expensesContainer, reminders: remindersContainer };
  }

  const databaseId = process.env.AZURE_COSMOS_DATABASE || "docuagent";
  const client = getCosmosClient();
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  const { container: expenses } = await database.containers.createIfNotExists({
    id: "expenses",
    partitionKey: { paths: ["/userId"] }
  });
  const { container: reminders } = await database.containers.createIfNotExists({
    id: "reminders",
    partitionKey: { paths: ["/userId"] }
  });
  expensesContainer = expenses;
  remindersContainer = reminders;
  return { expenses, reminders };
}

async function saveCosmosRecord(container, record, recordType) {
  const existing = await findCosmosRecord(container, record, recordType);
  if (existing) {
    return { record: existing, created: false };
  }

  try {
    await container.items.create(record);
    return { record, created: true };
  } catch (error) {
    if (!isCosmosStatus(error, 409)) {
      throw error;
    }
    const { resource } = await container.item(record.id, record.userId).read();
    return { record: resource, created: false };
  }
}

async function findCosmosRecord(container, record, recordType) {
  try {
    const { resource } = await container.item(record.id, record.userId).read();
    if (resource) {
      return resource;
    }
  } catch (error) {
    if (!isCosmosStatus(error, 404)) {
      throw error;
    }
  }

  const { resources } = await container.items.query(buildDuplicateQuery(record, recordType)).fetchAll();
  return resources[0] || null;
}

function isCosmosStatus(error, status) {
  return Number(error.code) === status || Number(error.statusCode) === status;
}

function ensureCosmosConfigured() {
  if (isCosmosConfigured()) {
    return;
  }

  const error = new Error(
    "문서 액션 저장소는 Azure Cosmos DB가 필요합니다. AZURE_COSMOS_ENDPOINT를 설정하고 Azure CLI 로그인 또는 Managed Identity 권한을 준비하세요."
  );
  error.statusCode = 503;
  error.code = "COSMOS_NOT_CONFIGURED";
  throw error;
}

function buildDuplicateQuery(record, recordType) {
  if (recordType === "expense") {
    return {
      query: [
        "SELECT TOP 1 * FROM c",
        "WHERE c.userId = @userId",
        "AND (c.dedupeKey = @dedupeKey",
        "OR (c.merchant = @merchant AND c.date = @date AND c.total = @total AND c.currency = @currency AND c.category = @category))"
      ].join(" "),
      parameters: [
        { name: "@userId", value: record.userId },
        { name: "@dedupeKey", value: record.dedupeKey },
        { name: "@merchant", value: record.merchant },
        { name: "@date", value: record.date },
        { name: "@total", value: record.total },
        { name: "@currency", value: record.currency },
        { name: "@category", value: record.category }
      ]
    };
  }

  return {
    query: [
      "SELECT TOP 1 * FROM c",
      "WHERE c.userId = @userId",
      "AND (c.dedupeKey = @dedupeKey",
      "OR (c.title = @title AND c.dueDate = @dueDate AND c.merchant = @merchant))"
    ].join(" "),
    parameters: [
      { name: "@userId", value: record.userId },
      { name: "@dedupeKey", value: record.dedupeKey },
      { name: "@title", value: record.title },
      { name: "@dueDate", value: record.dueDate },
      { name: "@merchant", value: record.merchant }
    ]
  };
}

function classifyDocument(text, fileName = "") {
  const source = `${text}\n${fileName}`.toLowerCase();
  if (/영수증|카드결제|합계|receipt|스타벅스|결제/.test(source)) {
    return "receipt";
  }
  if (/청구서|청구금액|납부기한|요금|bill|invoice/.test(source)) {
    return "bill";
  }
  if (/계약서|계약기간|임대차|특약|contract/.test(source)) {
    return "contract";
  }
  return "other";
}

function documentTypeLabel(documentType) {
  return {
    receipt: "영수증",
    bill: "청구서",
    contract: "계약서",
    other: "기타 문서"
  }[documentType];
}

function buildExpenseRecord(text, fileName, sourceUrl) {
  const total = extractAmount(text) || 0;
  const record = {
    userId: DEMO_USER,
    merchant: extractMerchant(text, fileName),
    date: extractDate(text) || todayKey(),
    total,
    currency: "KRW",
    category: inferExpenseCategory(text),
    items: extractLineItems(text, total),
    sourceUrl,
    createdAt: new Date().toISOString()
  };

  return withStableIdentity(record, "expense", "rec");
}

function buildReminder(text, fileName, sourceUrl) {
  const merchant = extractMerchant(text, fileName);
  const amount = extractAmount(text);
  const record = {
    userId: DEMO_USER,
    merchant,
    title: `${merchant} 납부 확인`,
    dueDate: extractDueDate(text) || extractDate(text) || todayKey(),
    amount: amount || undefined,
    currency: amount ? "KRW" : undefined,
    status: "pending",
    sourceUrl,
    createdAt: new Date().toISOString()
  };

  return withStableIdentity(record, "reminder", "rem");
}

function buildContractReminder(text, fileName, sourceUrl) {
  const merchant = extractMerchant(text, fileName);
  const record = {
    userId: DEMO_USER,
    merchant,
    title: `${merchant} 계약 만기 확인`,
    dueDate: extractContractEndDate(text) || todayKey(),
    status: "pending",
    sourceUrl,
    createdAt: new Date().toISOString()
  };

  return withStableIdentity(record, "reminder", "rem");
}

function withStableIdentity(record, recordType, prefix) {
  const signature = recordSignature(record, recordType);
  const dedupeKey = `${recordType}_${hashValue(signature).slice(0, 24)}`;

  return {
    id: `${prefix}_${hashValue(`${recordType}:${signature}`).slice(0, 12)}`,
    dedupeKey,
    ...record
  };
}

function recordSignature(record, recordType) {
  if (recordType === "expense") {
    return [
      record.userId,
      normalizeDedupeText(record.merchant),
      record.date,
      record.total || 0,
      record.currency || "",
      normalizeDedupeText(record.category)
    ].join("|");
  }

  return [
    record.userId,
    normalizeDedupeText(record.title),
    record.dueDate,
    normalizeDedupeText(record.merchant)
  ].join("|");
}

function normalizeDedupeText(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, "").trim();
}

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

function extractMerchant(text, fileName) {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (firstLine) {
    return firstLine.replace(/^\[/, "").replace(/\]/g, "").slice(0, 40);
  }

  return fileName || "문서";
}

function extractDate(text) {
  return text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
}

function extractDueDate(text) {
  return text.match(/(?:납부기한|마감|기한)[:\s]*(\d{4}-\d{2}-\d{2})/)?.[1] || null;
}

function extractContractEndDate(text) {
  return text.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)?.[2] || extractDueDate(text);
}

function extractAmount(text) {
  const preferredMatch = text.match(/(?:합계|청구금액|금액|월세)[:\s]*([0-9,]+)\s*원?/);
  const fallbackMatch = text.match(/([0-9]{1,3}(?:,[0-9]{3})+)\s*원?/g)?.at(-1);
  const rawAmount = preferredMatch?.[1] || fallbackMatch;

  return rawAmount ? Number(rawAmount.replace(/[^0-9]/g, "")) : null;
}

function inferExpenseCategory(text) {
  if (/커피|카페|스타벅스|라떼|아메리카노/.test(text)) {
    return "카페";
  }
  if (/교통|택시|지하철|버스/.test(text)) {
    return "교통";
  }
  if (/병원|약국|의료/.test(text)) {
    return "의료";
  }
  return "기타";
}

function extractLineItems(text, total) {
  const items = text
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(.+?)\s+([0-9,]+)$/);
      if (!match || /합계|청구금액/.test(line)) {
        return null;
      }

      return {
        name: match[1].trim(),
        price: Number(match[2].replace(/,/g, ""))
      };
    })
    .filter(Boolean);

  return items.length ? items : total ? [{ name: "문서 합계", price: total }] : [];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
