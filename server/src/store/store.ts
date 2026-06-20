import type { ExpenseRecord, Reminder } from "../types.js";
import { localBackend } from "./local.js";
import { cosmosBackend, isCosmosConfigured } from "./cosmos.js";

/**
 * Storage facade.
 *
 * The public functions never change; only the backend does. When Azure Cosmos
 * DB is configured (AZURE_COSMOS_ENDPOINT set), the Cosmos backend is used,
 * otherwise a local JSON-file backend is used for offline development.
 */

export interface StoreBackend {
  saveExpense(record: ExpenseRecord): Promise<ExpenseRecord>;
  listExpenses(userId: string): Promise<ExpenseRecord[]>;
  saveReminder(reminder: Reminder): Promise<Reminder>;
  listReminders(userId: string): Promise<Reminder[]>;
  /** Month-to-date total spent in a category for the given YYYY-MM month. */
  monthToDateByCategory(
    userId: string,
    category: string,
    monthIso: string,
  ): Promise<number>;
}

const backend: StoreBackend = isCosmosConfigured()
  ? cosmosBackend
  : localBackend;

export function activeBackendName(): "cosmos" | "local" {
  return isCosmosConfigured() ? "cosmos" : "local";
}

export const saveExpense: StoreBackend["saveExpense"] = (r) =>
  backend.saveExpense(r);
export const listExpenses: StoreBackend["listExpenses"] = (u) =>
  backend.listExpenses(u);
export const saveReminder: StoreBackend["saveReminder"] = (r) =>
  backend.saveReminder(r);
export const listReminders: StoreBackend["listReminders"] = (u) =>
  backend.listReminders(u);
export const monthToDateByCategory: StoreBackend["monthToDateByCategory"] = (
  u,
  c,
  m,
) => backend.monthToDateByCategory(u, c, m);
