const express = require('express');
const path = require('path');
const { CopilotClient } = require('@github/copilot-sdk');

const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;

let copilotClient;

async function initCopilot() {
  try {
    copilotClient = new CopilotClient();
    await copilotClient.start();
    console.log('Copilot client started');
  } catch (err) {
    console.error('Failed to start Copilot client', err);
  }
}

app.post('/api/generate', async (req, res) => {
  if (!copilotClient) return res.status(500).json({ error: 'Copilot client not initialized' });
  try {
    const session = await copilotClient.createSession({ model: 'gpt-4.1' });
    const response = await session.sendAndWait({ prompt: req.body.prompt || '' });
    res.json({ result: response?.data?.content ?? null });
  } catch (err) {
    console.error('Copilot request error', err);
    res.status(500).json({ error: 'Copilot request failed', details: err.message });
  }
});

// Serve built client
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initCopilot();

app.listen(port, () => console.log(`Server listening on ${port}`));
