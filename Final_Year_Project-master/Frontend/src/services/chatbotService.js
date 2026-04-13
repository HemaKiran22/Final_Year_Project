const CHAT_ENDPOINT = '/api/chat';

function normalizeMessage(message) {
  if (!message) return null;

  if (typeof message === 'string') {
    const trimmed = message.trim();
    return trimmed ? { role: 'user', content: trimmed } : null;
  }

  if (message.role && message.content != null) {
    const content = String(message.content).trim();
    return content ? { role: message.role, content } : null;
  }

  const role = message.from === 'bot' ? 'assistant' : 'user';
  const content = String(message.text ?? message.content ?? '').trim();
  return content ? { role, content } : null;
}

export function toChatMessages(history = []) {
  return history.map(normalizeMessage).filter(Boolean);
}

export async function sendChatMessage(messages, options = {}) {
  const payload = {
    model: options.model,
    messages: Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [],
  };

  const response = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Chat request failed (${response.status})`);
  }

  return {
    answer: data?.answer || '',
    sources: Array.isArray(data?.sources) ? data.sources : [],
    confidence: data?.confidence ?? null,
  };
}