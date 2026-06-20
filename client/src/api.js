const JSON_HEADERS = {
  "Content-Type": "application/json"
};

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok && response.status !== 207) {
    throw new Error(data.error || "API request failed");
  }

  return data;
}

export function generatePlan(payload) {
  return postJson("/api/schedule/generate", payload);
}

export function generateReview(payload) {
  return postJson("/api/review/generate", payload);
}
