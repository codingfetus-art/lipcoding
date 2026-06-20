import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExpenseRecord, Reminder } from "../types.js";
import type { StoreBackend } from "./store.js";

/**
 * Local JSON-file persistence for the MVP / offline development.
 * Implements the same StoreBackend interface as the Cosmos DB backend.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const EXPENSES_FILE = path.join(DATA_DIR, "expenses.json");
const REMINDERS_FILE = path.join(DATA_DIR, "reminders.json");

async function readJson<T>(file: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

async function writeJson<T>(file: string, data: T[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

export const localBackend: StoreBackend = {
  async saveExpense(record: ExpenseRecord) {
    const all = await readJson<ExpenseRecord>(EXPENSES_FILE);
    all.push(record);
    await writeJson(EXPENSES_FILE, all);
    return record;
  },

  async listExpenses(userId: string) {
    const all = await readJson<ExpenseRecord>(EXPENSES_FILE);
    return all.filter((e) => e.userId === userId);
  },

  async saveReminder(reminder: Reminder) {
    const all = await readJson<Reminder>(REMINDERS_FILE);
    all.push(reminder);
    await writeJson(REMINDERS_FILE, all);
    return reminder;
  },

  async listReminders(userId: string) {
    const all = await readJson<Reminder>(REMINDERS_FILE);
    return all.filter((r) => r.userId === userId);
  },

  async monthToDateByCategory(userId, category, monthIso) {
    const all = await this.listExpenses(userId);
    return all
      .filter((e) => e.category === category && e.date.startsWith(monthIso))
      .reduce((sum, e) => sum + e.total, 0);
  },
};
