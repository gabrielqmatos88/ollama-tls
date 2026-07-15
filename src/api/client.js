/**
 * Call an OpenAI-compatible chat completions endpoint with streaming.
 *
 * @param {Object} params
 * @param {string} params.baseUrl - e.g. "http://localhost:11434/v1"
 * @param {string} params.apiKey - empty string for local providers
 * @param {string} params.model - model name
 * @param {Array} params.messages - [{ role, content }]
 * @param {AbortSignal} params.signal - for cancellation
 * @param {Function} params.onChunk - called with each content delta
 * @returns {Promise<string>} full response text
 */
export async function callProvider({
  baseUrl,
  apiKey,
  model,
  messages,
  signal,
  onChunk,
  keepAlive,
}) {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const payload = {
    model,
    messages,
    stream: true,
  };
  if (keepAlive !== undefined && keepAlive !== null && keepAlive !== "") {
    payload.keep_alive = keepAlive;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") break;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk?.(delta, fullText);
        }
      } catch {
        // skip malformed JSON chunks
      }
    }
  }

  return fullText;
}

export async function fetchModels({ baseUrl, apiKey }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;

  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    return data.data || data;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
