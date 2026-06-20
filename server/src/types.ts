export type DocumentType = "receipt" | "bill" | "contract" | "other";

export interface LineItem {
  name: string;
  price: number;
  quantity?: number;
}

/** A persisted expense record (typically from a receipt). */
export interface ExpenseRecord {
  id: string;
  userId: string;
  type: "receipt";
  merchant: string;
  date: string; // ISO date (YYYY-MM-DD)
  total: number;
  currency: string;
  category: string;
  items: LineItem[];
  sourceFile?: string;
  createdAt: string; // ISO timestamp
}

/** A reminder, typically extracted from a bill / invoice. */
export interface Reminder {
  id: string;
  userId: string;
  type: "bill";
  merchant: string;
  title: string;
  dueDate: string; // ISO date
  amount?: number;
  currency?: string;
  status: "pending" | "done";
  sourceFile?: string;
  createdAt: string;
}

/** Result returned to the client after processing a document. */
export interface ProcessResult {
  documentType: DocumentType;
  summary: string;
  expense?: ExpenseRecord;
  reminder?: Reminder;
  draftMessage?: string;
  steps: string[]; // human-readable trace of tool calls the agent made
}
