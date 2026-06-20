import { COPILOT_CONFIG } from "./config.js";

export async function callCopilot(prompt) {
  const { CopilotClient } = await import("@github/copilot-sdk");
  const client = new CopilotClient();

  await client.start();
  let session;

  try {
    session = await client.createSession({
      model: COPILOT_CONFIG.model
    });

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
