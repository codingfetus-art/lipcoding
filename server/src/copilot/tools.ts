import { randomUUID } from "node:crypto";
import { defineTool } from "@github/copilot-sdk";
import {
  saveExpense,
  saveReminder,
  monthToDateByCategory,
} from "../store/store.js";
import type { ExpenseRecord, Reminder, ProcessResult } from "../types.js";

/**
 * Custom tools exposed to the Copilot agent.
 *
 * Division of responsibility:
 *   - The agent (LLM) does the *reasoning*: read the document, classify it,
 *     extract fields, decide which tools to call and in what order.
 *   - These tools do the *side effects*: persist data, analyze against stored
 *     history, register reminders. This is what makes the app "act", not just chat.
 *
 * `collector` accumulates structured results + a human-readable trace so the
 * API can return them to the UI alongside the agent's natural-language summary.
 *
 * Parameters are declared as plain JSON Schema (not coupled to a specific Zod
 * version), and handler args are typed explicitly.
 */
export interface ToolCollector {
  userId: string;
  sourceFile?: string;
  steps: string[];
  expense?: ExpenseRecord;
  reminder?: Reminder;
  draftMessage?: string;
}

interface SaveExpenseArgs {
  merchant: string;
  date: string;
  total: number;
  currency?: string;
  category: string;
  items?: { name: string; price: number; quantity?: number }[];
}

interface AnalyzeBudgetArgs {
  category: string;
  date: string;
}

interface SetReminderArgs {
  merchant: string;
  title: string;
  dueDate: string;
  amount?: number;
  currency?: string;
}

interface SaveDraftArgs {
  purpose: string;
  body: string;
}

function currentMonthIso(date: string): string {
  // date is YYYY-MM-DD -> YYYY-MM
  return date.slice(0, 7);
}

export function createTools(collector: ToolCollector) {
  return [
    defineTool("save_expense", {
      description:
        "Persist a receipt as an expense record. Call this once per receipt after you have extracted the merchant, date, total amount and a spending category.",
      parameters: {
        type: "object",
        properties: {
          merchant: { type: "string", description: "Store / merchant name" },
          date: {
            type: "string",
            description: "Purchase date in YYYY-MM-DD format",
          },
          total: { type: "number", description: "Total amount paid" },
          currency: {
            type: "string",
            description: "ISO currency code, e.g. KRW, USD",
            default: "KRW",
          },
          category: {
            type: "string",
            description:
              "Spending category in Korean, e.g. 식비, 카페, 교통, 쇼핑, 생활, 의료, 기타",
          },
          items: {
            type: "array",
            description: "Line items on the receipt",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: "number" },
                quantity: { type: "number" },
              },
              required: ["name", "price"],
            },
          },
        },
        required: ["merchant", "date", "total", "category"],
      },
      handler: async (raw) => {
        const args = raw as SaveExpenseArgs;
        const record: ExpenseRecord = {
          id: `rec_${randomUUID().slice(0, 8)}`,
          userId: collector.userId,
          type: "receipt",
          merchant: args.merchant,
          date: args.date,
          total: args.total,
          currency: args.currency ?? "KRW",
          category: args.category,
          items: args.items ?? [],
          sourceFile: collector.sourceFile,
          createdAt: new Date().toISOString(),
        };
        await saveExpense(record);
        collector.expense = record;
        collector.steps.push(
          `지출 기록 저장: ${record.merchant} ${record.total.toLocaleString()}${record.currency} (${record.category})`,
        );
        return {
          id: record.id,
          saved: true,
        };
      },
    }),

    defineTool("analyze_budget", {
      description:
        "Analyze how a spending amount in a category compares to this month's spending and budget. Call after save_expense to give the user a budget warning if relevant.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Spending category to analyze",
          },
          date: {
            type: "string",
            description: "Reference date YYYY-MM-DD (used to pick the month)",
          },
        },
        required: ["category", "date"],
      },
      handler: async (raw) => {
        const args = raw as AnalyzeBudgetArgs;
        const monthIso = currentMonthIso(args.date);
        const spent = await monthToDateByCategory(
          collector.userId,
          args.category,
          monthIso,
        );
        const totalBudget = Number(
          process.env.MONTHLY_BUDGET_TOTAL ?? "1000000",
        );
        // Simple heuristic: per-category soft cap = 30% of total monthly budget.
        const categoryCap = Math.round(totalBudget * 0.3);
        const ratio = categoryCap > 0 ? spent / categoryCap : 0;
        collector.steps.push(
          `예산 분석: ${monthIso} '${args.category}' 누적 ${spent.toLocaleString()}원 (한도 대비 ${Math.round(ratio * 100)}%)`,
        );
        return {
          monthToDateSpent: spent,
          categorySoftCap: categoryCap,
          usageRatio: Number(ratio.toFixed(2)),
          overBudget: ratio >= 1,
          warning: ratio >= 0.8,
        };
      },
    }),

    defineTool("set_reminder", {
      description:
        "Register a payment/due-date reminder, typically extracted from a bill or invoice. Use for documents that have a future due date and amount.",
      parameters: {
        type: "object",
        properties: {
          merchant: { type: "string", description: "Biller / company name" },
          title: { type: "string", description: "Short reminder title" },
          dueDate: {
            type: "string",
            description: "Due date in YYYY-MM-DD format",
          },
          amount: { type: "number", description: "Amount due" },
          currency: { type: "string", default: "KRW" },
        },
        required: ["merchant", "title", "dueDate"],
      },
      handler: async (raw) => {
        const args = raw as SetReminderArgs;
        const reminder: Reminder = {
          id: `rem_${randomUUID().slice(0, 8)}`,
          userId: collector.userId,
          type: "bill",
          merchant: args.merchant,
          title: args.title,
          dueDate: args.dueDate,
          amount: args.amount,
          currency: args.currency ?? "KRW",
          status: "pending",
          sourceFile: collector.sourceFile,
          createdAt: new Date().toISOString(),
        };
        await saveReminder(reminder);
        collector.reminder = reminder;
        collector.steps.push(
          `리마인드 등록: ${reminder.title} (마감 ${reminder.dueDate})`,
        );
        return { id: reminder.id, saved: true };
      },
    }),

    defineTool("save_draft_message", {
      description:
        "Store a draft message (e.g. a cancellation notice or an inquiry email) that you wrote for the user to review and optionally send.",
      parameters: {
        type: "object",
        properties: {
          purpose: {
            type: "string",
            description: "What this message is for, e.g. '구독 해지 안내'",
          },
          body: { type: "string", description: "The full draft message text" },
        },
        required: ["purpose", "body"],
      },
      handler: async (raw) => {
        const args = raw as SaveDraftArgs;
        collector.draftMessage = args.body;
        collector.steps.push(`초안 작성: ${args.purpose}`);
        return { saved: true };
      },
    }),
  ];
}

export function buildResult(
  collector: ToolCollector,
  documentType: ProcessResult["documentType"],
  summary: string,
): ProcessResult {
  return {
    documentType,
    summary,
    expense: collector.expense,
    reminder: collector.reminder,
    draftMessage: collector.draftMessage,
    steps: collector.steps,
  };
}
