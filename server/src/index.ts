import "dotenv/config";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import multer from "multer";
import { processDocument, shutdown } from "./copilot/agent.js";
import { listExpenses, listReminders, activeBackendName } from "./store/store.js";
import { extractDocument } from "./ocr/extract.js";
import { uploadDocument } from "./storage/blob.js";

const PORT = Number(process.env.PORT || 3001);

// Single demo user for the MVP (replace with real auth in production).
const DEMO_USER = "demo-user";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * Process a document. Accepts either:
 *   - multipart/form-data with a `file` field (image/PDF), and/or
 *   - a `text` field (pasted document content).
 */
app.post("/api/process", upload.single("file"), async (req, res) => {
  let tempPath: string | undefined;
  try {
    const text: string | undefined = req.body?.text;
    const file = req.file;

    if (!text && !file) {
      res.status(400).json({ error: "문서 텍스트 또는 파일이 필요합니다." });
      return;
    }

    let combinedText = text?.trim() || "";
    let sourceUrl: string | undefined;

    if (file) {
      const contentType = file.mimetype || "application/octet-stream";

      // 1) Persist original to Blob Storage (when configured).
      sourceUrl = await uploadDocument(file.buffer, file.originalname, contentType);

      // 2) OCR via Azure Document Intelligence (when configured).
      const extracted = await extractDocument(file.buffer, contentType);
      if (extracted.text) {
        combinedText = [combinedText, extracted.text].filter(Boolean).join("\n\n");
      }

      // 3) If no text was obtained, attach the file so the model can read it.
      if (!extracted.text) {
        const ext = path.extname(file.originalname) || "";
        tempPath = path.join(os.tmpdir(), `docuagent-${randomUUID()}${ext}`);
        await fs.writeFile(tempPath, file.buffer);
      }
    }

    const result = await processDocument({
      userId: DEMO_USER,
      text: combinedText || undefined,
      attachmentPath: tempPath,
      fileName: file?.originalname,
      sourceUrl,
    });

    res.json(result);
  } catch (err) {
    console.error("process error", err);
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "처리 중 오류" });
  } finally {
    if (tempPath) {
      fs.unlink(tempPath).catch(() => undefined);
    }
  }
});

app.get("/api/expenses", async (_req, res) => {
  const expenses = await listExpenses(DEMO_USER);
  res.json(expenses);
});

app.get("/api/reminders", async (_req, res) => {
  const reminders = await listReminders(DEMO_USER);
  res.json(reminders);
});

/** Monthly summary grouped by category for the dashboard. */
app.get("/api/summary", async (_req, res) => {
  const expenses = await listExpenses(DEMO_USER);
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.total;
    total += e.total;
  }
  res.json({ total, byCategory, count: expenses.length });
});

// In production, serve the built React app from the same container.
const STATIC_DIR = process.env.STATIC_DIR;
if (STATIC_DIR) {
  app.use(express.static(STATIC_DIR));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] storage backend: ${activeBackendName()}`);
});

async function gracefulShutdown() {
  console.log("\n[server] shutting down...");
  server.close();
  await shutdown();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
