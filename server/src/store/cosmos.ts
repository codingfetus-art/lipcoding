import { CosmosClient, type Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import type { ExpenseRecord, Reminder } from "../types.js";
import type { StoreBackend } from "./store.js";

/**
 * Azure Cosmos DB persistence (production).
 *
 * Auth:
 *   - If AZURE_COSMOS_KEY is set, key-based auth is used.
 *   - Otherwise DefaultAzureCredential (Managed Identity) is used — the
 *     recommended approach when running on Azure Container Apps.
 *
 * Containers use `/userId` as the partition key.
 */

export function isCosmosConfigured(): boolean {
  return Boolean(process.env.AZURE_COSMOS_ENDPOINT);
}

let cachedClient: CosmosClient | null = null;
let expensesContainer: Container | null = null;
let remindersContainer: Container | null = null;

function getClient(): CosmosClient {
  if (cachedClient) return cachedClient;
  const endpoint = process.env.AZURE_COSMOS_ENDPOINT!;
  const key = process.env.AZURE_COSMOS_KEY;
  cachedClient = key
    ? new CosmosClient({ endpoint, key })
    : new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
  return cachedClient;
}

async function getContainers(): Promise<{
  expenses: Container;
  reminders: Container;
}> {
  if (expensesContainer && remindersContainer) {
    return { expenses: expensesContainer, reminders: remindersContainer };
  }
  const dbId = process.env.AZURE_COSMOS_DATABASE || "docuagent";
  const client = getClient();
  const { database } = await client.databases.createIfNotExists({ id: dbId });
  const { container: expenses } = await database.containers.createIfNotExists({
    id: "expenses",
    partitionKey: { paths: ["/userId"] },
  });
  const { container: reminders } = await database.containers.createIfNotExists({
    id: "reminders",
    partitionKey: { paths: ["/userId"] },
  });
  expensesContainer = expenses;
  remindersContainer = reminders;
  return { expenses, reminders };
}

export const cosmosBackend: StoreBackend = {
  async saveExpense(record: ExpenseRecord) {
    const { expenses } = await getContainers();
    await expenses.items.create(record);
    return record;
  },

  async listExpenses(userId: string) {
    const { expenses } = await getContainers();
    const { resources } = await expenses.items
      .query<ExpenseRecord>({
        query: "SELECT * FROM c WHERE c.userId = @u",
        parameters: [{ name: "@u", value: userId }],
      })
      .fetchAll();
    return resources;
  },

  async saveReminder(reminder: Reminder) {
    const { reminders } = await getContainers();
    await reminders.items.create(reminder);
    return reminder;
  },

  async listReminders(userId: string) {
    const { reminders } = await getContainers();
    const { resources } = await reminders.items
      .query<Reminder>({
        query: "SELECT * FROM c WHERE c.userId = @u",
        parameters: [{ name: "@u", value: userId }],
      })
      .fetchAll();
    return resources;
  },

  async monthToDateByCategory(userId, category, monthIso) {
    const { expenses } = await getContainers();
    const { resources } = await expenses.items
      .query<number>({
        query:
          "SELECT VALUE SUM(c.total) FROM c WHERE c.userId = @u AND c.category = @cat AND STARTSWITH(c.date, @month)",
        parameters: [
          { name: "@u", value: userId },
          { name: "@cat", value: category },
          { name: "@month", value: monthIso },
        ],
      })
      .fetchAll();
    return resources[0] ?? 0;
  },
};
