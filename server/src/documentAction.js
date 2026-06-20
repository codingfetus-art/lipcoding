import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";

const DEMO_USER = "demo-user";
const DOCUMENT_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "documents";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const EXPENSES_FILE = path.join(DATA_DIR, "expenses.json");
const REMINDERS_FILE = path.join(DATA_DIR, "reminders.json");

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
    storageBackend: isCosmosConfigured() ? "cosmos" : "local-json"
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
    const expense = buildExpenseRecord(sourceText, fallbackName, sourceUrl);
    await saveExpense(expense);
    steps.push(`지출 기록 저장: ${expense.merchant} ${expense.total.toLocaleString("ko-KR")}원`);

    return {
      documentType,
      summary: `**${expense.merchant}** 지출 ${expense.total.toLocaleString("ko-KR")}원을 **${expense.category}** 카테고리로 기록했습니다.`,
      expense,
      steps
    };
  }

  if (documentType === "bill") {
    const reminder = buildReminder(sourceText, fallbackName, sourceUrl);
    await saveReminder(reminder);
    steps.push(`리마인드 등록: ${reminder.title} (${reminder.dueDate})`);

    return {
      documentType,
      summary: `**${reminder.title}** 마감일을 **${reminder.dueDate}**로 등록했습니다.`,
      reminder,
      steps
    };
  }

  if (documentType === "contract") {
    const reminder = buildContractReminder(sourceText, fallbackName, sourceUrl);
    await saveReminder(reminder);
    const draftMessage = [
      "안녕하세요.",
      "계약 만기 및 주요 조건 확인을 위해 연락드립니다.",
      "계약 종료 또는 갱신 의사 확인이 필요한 일정이 있어 검토 부탁드립니다.",
      "감사합니다."
    ].join("\n");
    steps.push(`계약 리마인드 등록: ${reminder.title}`);
    steps.push("확인 요청 초안 작성");

    return {
      documentType,
      summary: `계약 문서에서 **${reminder.title}** 일정을 찾아 리마인드와 확인 요청 초안을 만들었습니다.`,
      reminder,
      draftMessage,
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
  if (isCosmosConfigured()) {
    const { expenses } = await getCosmosContainers();
    const { resources } = await expenses.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: DEMO_USER }]
      })
      .fetchAll();
    return resources;
  }

  return readJson(EXPENSES_FILE);
}

export async function listReminders() {
  if (isCosmosConfigured()) {
    const { reminders } = await getCosmosContainers();
    const { resources } = await reminders.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: DEMO_USER }]
      })
      .fetchAll();
    return resources;
  }

  return readJson(REMINDERS_FILE);
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
  if (isCosmosConfigured()) {
    const { expenses } = await getCosmosContainers();
    await expenses.items.create(record);
    return record;
  }

  const all = await readJson(EXPENSES_FILE);
  all.push(record);
  await writeJson(EXPENSES_FILE, all);
  return record;
}

async function saveReminder(reminder) {
  if (isCosmosConfigured()) {
    const { reminders } = await getCosmosContainers();
    await reminders.items.create(reminder);
    return reminder;
  }

  const all = await readJson(REMINDERS_FILE);
  all.push(reminder);
  await writeJson(REMINDERS_FILE, all);
  return reminder;
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
  return isAzureDocumentActionEnabled() && Boolean(process.env.AZURE_COSMOS_ENDPOINT);
}

function isAzureDocumentActionEnabled() {
  return process.env.DOCUMENT_ACTION_AZURE_ENABLED === "true";
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

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
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

  return {
    id: `rec_${randomUUID().slice(0, 8)}`,
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
}

function buildReminder(text, fileName, sourceUrl) {
  const merchant = extractMerchant(text, fileName);
  const amount = extractAmount(text);

  return {
    id: `rem_${randomUUID().slice(0, 8)}`,
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
}

function buildContractReminder(text, fileName, sourceUrl) {
  const merchant = extractMerchant(text, fileName);

  return {
    id: `rem_${randomUUID().slice(0, 8)}`,
    userId: DEMO_USER,
    merchant,
    title: `${merchant} 계약 만기 확인`,
    dueDate: extractContractEndDate(text) || todayKey(),
    status: "pending",
    sourceUrl,
    createdAt: new Date().toISOString()
  };
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
