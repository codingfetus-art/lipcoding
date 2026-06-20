import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createTools, buildResult, type ToolCollector } from "./tools.js";
import type { ProcessResult } from "../types.js";

/**
 * The Copilot SDK is the *brain* of this app. Given a document, the agent
 * autonomously decides what kind of document it is and which tools to call
 * (save_expense, analyze_budget, set_reminder, save_draft_message) and in
 * what order. Remove the SDK and the app stops working — it is the core.
 */

const MODEL = process.env.COPILOT_MODEL || "claude-sonnet-4.5";

const SYSTEM_PROMPT = `You are a personal finance & document assistant.
The user uploads a document (receipt, bill/invoice, contract, or other). Your job:

1. Read the document content (from the provided text and/or the attached image).
2. Decide the document type: receipt, bill, contract, or other, and immediately
   call classify_document with that type (exactly once, before any other tool).
3. Take the right actions using the available tools:
   - RECEIPT: extract merchant, date (YYYY-MM-DD), total, currency, a Korean
     spending category (식비/카페/교통/쇼핑/생활/의료/기타), and line items.
     Call save_expense, then call analyze_budget for that category.
   - BILL / INVOICE: extract biller, due date and amount. Call set_reminder.
     If it looks like a subscription the user might want to cancel, also write a
     polite Korean cancellation notice with save_draft_message.
   - CONTRACT: summarize the key clauses and any risks. If there is a renewal /
     expiry date, call set_reminder.
   - OTHER: briefly summarize what it is.
4. Finish with a short, friendly summary IN KOREAN of what you found and what you
   did. Mention any budget warning. Do not invent data that is not in the document.

Always prefer calling tools over only describing actions. Keep the final summary concise.`;

let clientPromise: Promise<CopilotClient> | null = null;

/**
 * Locate the Copilot CLI runtime entry point.
 *
 * The SDK auto-discovery (`getBundledCliPath`) expects the runtime at
 * `@github/copilot/index.js`, but in the installed version the runtime ships in
 * the platform package (e.g. `@github/copilot-win32-x64`). That package only
 * exposes its `./sdk` subpath via "exports", so we resolve `<pkg>/sdk` and walk
 * up to its sibling `index.js`. The result is exported via COPILOT_CLI_PATH,
 * which the SDK honors.
 */
function resolveCopilotCliPath(): string | undefined {
  if (process.env.COPILOT_CLI_PATH) return process.env.COPILOT_CLI_PATH;
  const platformPkg = `@github/copilot-${process.platform}-${process.arch}`;
  try {
    const sdkPath = fileURLToPath(import.meta.resolve(`${platformPkg}/sdk`));
    const indexPath = join(dirname(dirname(sdkPath)), "index.js");
    if (existsSync(indexPath)) return indexPath;
  } catch {
    // platform package not installed / not resolvable; fall back to SDK default
  }
  return undefined;
}

async function getClient(): Promise<CopilotClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const cliPath = resolveCopilotCliPath();
      if (cliPath) process.env.COPILOT_CLI_PATH = cliPath;
      const client = new CopilotClient();
      await client.start();
      return client;
    })();
  }
  return clientPromise;
}

export async function shutdown(): Promise<void> {
  if (clientPromise) {
    const client = await clientPromise;
    await client.stop();
    clientPromise = null;
  }
}

export interface ProcessInput {
  userId: string;
  /** Raw document text (e.g. pasted by the user or from Document Intelligence). */
  text?: string;
  /** Path to an uploaded image/PDF to attach so the model can read it directly. */
  attachmentPath?: string;
  fileName?: string;
  /** Persisted source location (e.g. Blob URL) stored on records. */
  sourceUrl?: string;
}

export async function processDocument(
  input: ProcessInput,
): Promise<ProcessResult> {
  const client = await getClient();

  const collector: ToolCollector = {
    userId: input.userId,
    sourceFile: input.sourceUrl ?? input.fileName,
    steps: [],
  };

  const session = await client.createSession({
    onPermissionRequest: approveAll,
    model: MODEL,
    tools: createTools(collector),
    systemMessage: { mode: "append", content: SYSTEM_PROMPT },
  });

  try {
    const promptParts: string[] = [];
    if (input.text && input.text.trim()) {
      promptParts.push("Document content:\n" + input.text.trim());
    }
    if (input.attachmentPath) {
      promptParts.push(
        "An image/PDF of the document is attached. Read it to extract the details.",
      );
    }
    if (promptParts.length === 0) {
      promptParts.push("No document content was provided.");
    }

    const response = await session.sendAndWait(
      {
        prompt: promptParts.join("\n\n"),
        attachments: input.attachmentPath
          ? [
              {
                type: "file",
                path: input.attachmentPath,
                displayName: input.fileName || "document",
              },
            ]
          : undefined,
      },
      120_000,
    );

    const summary =
      response?.data.content?.trim() ||
      "문서를 처리했지만 요약을 생성하지 못했습니다.";

    // The agent declares the type via classify_document. Fall back to inferring
    // it from the side-effects it performed if it skipped the classification.
    const documentType: ProcessResult["documentType"] =
      collector.documentType ??
      (collector.expense
        ? "receipt"
        : collector.reminder
          ? "bill"
          : collector.draftMessage
            ? "contract"
            : "other");

    return buildResult(collector, documentType, summary);
  } finally {
    await session.disconnect();
  }
}
