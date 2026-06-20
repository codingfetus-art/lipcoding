import React, { useState } from 'react';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setResult('...');
    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const json = await r.json();
      setResult(json.result || JSON.stringify(json));
    } catch (err) {
      setResult('Error: ' + err.message);
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Copilot Web App</h1>
      <form onSubmit={onSubmit}>
        <textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} rows={6} cols={60} placeholder="Prompt" />
        <br />
        <button type="submit">Generate</button>
      </form>
      <pre style={{whiteSpace: 'pre-wrap', marginTop: 20}}>{result}</pre>
    </div>
  );
}
