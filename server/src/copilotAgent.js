import { createRequire } from "node:module";
import { COPILOT_CONFIG } from "./config.js";

const require = createRequire(import.meta.url);

export async function callCopilot(prompt) {
  const { CopilotClient, RuntimeConnection } = await import("@github/copilot-sdk");
  const client = new CopilotClient({
    connection: RuntimeConnection.forStdio({
      path: resolveCopilotRuntimePath()
    })
  });

  await client.start();
  let session;

  try {
    session = await client.createSession(
      COPILOT_CONFIG.model ? { model: COPILOT_CONFIG.model } : {}
    );

    const messages = [];
    await waitForCopilotResponse(session, prompt, messages);
    const response = messages.join("\n").trim();

    if (!response) {
      throw new Error("Copilot SDK returned an empty response");
    }

    return response;
  } finally {
    if (session) {
      await session.disconnect();
    }
    await client.stop();
  }
}

function resolveCopilotRuntimePath() {
  return (
    process.env.COPILOT_RUNTIME_PATH ||
    process.env.COPILOT_CLI_PATH ||
    require.resolve("@github/copilot/npm-loader.js")
  );
}

function waitForCopilotResponse(session, prompt, messages) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Copilot SDK request timed out"));
    }, COPILOT_CONFIG.timeoutMs);

    session.on("assistant.message", (event) => {
      if (event?.data?.content) {
        messages.push(event.data.content);
      }
    });

    session.on("session.idle", () => {
      clearTimeout(timeout);
      resolve();
    });

    session.send({ prompt }).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
