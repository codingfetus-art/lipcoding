export interface LineItem {
  name: string;
  price: number;
  quantity?: number;
}

export interface ExpenseRecord {
  id: string;
  merchant: string;
  date: string;
  total: number;
  currency: string;
  category: string;
  items: LineItem[];
}

export interface Reminder {
  id: string;
  merchant: string;
  title: string;
  dueDate: string;
  amount?: number;
  currency?: string;
  status: string;
}

export interface ProcessResult {
  documentType: "receipt" | "bill" | "contract" | "other";
  summary: string;
  expense?: ExpenseRecord;
  reminder?: Reminder;
  draftMessage?: string;
  steps: string[];
}

export interface Summary {
  total: number;
  byCategory: Record<string, number>;
  count: number;
}

export async function processDocument(params: {
  text?: string;
  file?: File | null;
}): Promise<ProcessResult> {
  const form = new FormData();
  if (params.text) form.append("text", params.text);
  if (params.file) form.append("file", params.file);

  const res = await fetch("/api/process", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "요청 실패" }));
    throw new Error(err.error || "요청 실패");
  }
  return res.json();
}

export async function getSummary(): Promise<Summary> {
  const res = await fetch("/api/summary");
  return res.json();
}

export async function getReminders(): Promise<Reminder[]> {
  const res = await fetch("/api/reminders");
  return res.json();
}
