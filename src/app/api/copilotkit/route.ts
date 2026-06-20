import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // GitHub Models API — OpenAI 호환 엔드포인트 (GitHub PAT으로 접근)
  const openai = new OpenAI({
    apiKey: process.env.GITHUB_TOKEN,
    baseURL: "https://models.inference.ai.azure.com",
  });

  const serviceAdapter = new OpenAIAdapter({ openai, model: "gpt-4o" });
  const runtime = new CopilotRuntime();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
}
