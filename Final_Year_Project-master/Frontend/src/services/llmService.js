async function callApi(url, payload) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let data;
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { data = await resp.json(); } catch { data = null; }
  } else {
    try { const txt = await resp.text(); data = txt ? { raw: txt } : null; } catch { data = null; }
  }
  return { resp, data };
}

async function callGeminiDirect(apiKey, model, messages) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }]
  }));
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents })
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error((data && (data.error?.message || data.error)) || `Gemini error (status ${resp.status})`);
  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return answer;
}

async function callGroqDirect(apiKey, model, messages) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const payload = {
    model,
    messages: messages.map(m => ({ role: m.role, content: String(m.content || '') })),
    temperature: 0.7,
    stream: false,
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = data?.error?.message || data?.error || `Groq error (status ${resp.status})`;
    throw new Error(msg);
  }
  const answer = data?.choices?.[0]?.message?.content || '';
  return answer;
}

function isDecommissionedError(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return msg.includes('decommissioned') || msg.includes('no longer supported') || msg.includes('model not found');
}

async function callGroqWithFallback(apiKey, primaryModel, messages) {
  const candidates = [primaryModel, 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
  const tried = new Set();
  let lastError = null;
  for (const m of candidates) {
    if (tried.has(m)) continue;
    tried.add(m);
    try {
      try { console.info('[llmService] Trying Groq model:', m); } catch {}
      const answer = await callGroqDirect(apiKey, m, messages);
      return { ok: true, answer, model: m };
    } catch (e) {
      lastError = e;
      if (!isDecommissionedError(e)) break;
    }
  }
  return { ok: false, error: (lastError && (lastError.message || String(lastError))) || 'Groq call failed' };
}

export async function askLLM(prompt, history = [], opts = {}) {
  const provider = (import.meta.env.VITE_LLM_PROVIDER || 'openai').toLowerCase();
  const configuredUrl = import.meta.env.VITE_CHAT_API_URL;
  const defaultUrl = '/api/chat';
  const apiUrl = configuredUrl || defaultUrl;
  const defaultModelEnv = import.meta.env.VITE_LLM_MODEL;
  const defaultGoogleModel = defaultModelEnv || 'gemini-1.5-flash-latest';
  const defaultGroqModel = defaultModelEnv || 'llama-3.1-8b-instant';
  const model = opts.model || (
    provider === 'google' ? defaultGoogleModel : (
      provider === 'groq' ? defaultGroqModel : 'gpt-4o-mini'
    )
  );

  // Diagnostics: log provider configuration once per call
  try {
    console.debug('[llmService] provider:', provider, 'apiUrl:', apiUrl, 'model:', model);
  } catch {}

  const messages = [
    { role: 'system', content: 'You are a helpful assistant for a society carpool app. Be concise, friendly, and actionable.' },
    ...history.map(m => ({ role: m.from === 'bot' ? 'assistant' : 'user', content: String(m.text || '') })),
    { role: 'user', content: String(prompt || '') }
  ];

  // Dev shortcut: if explicitly set to 'direct', bypass server and call Gemini from browser
  if (provider === 'google' && configuredUrl && configuredUrl.toLowerCase() === 'direct') {
    try { console.info('[llmService] Using Google Gemini direct mode'); } catch {}
    const browserKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!browserKey) {
      return { ok: false, error: 'Gemini key missing in frontend env (VITE_GEMINI_API_KEY).' };
    }
    try {
      const direct = await callGeminiDirect(browserKey, model, messages);
      return { ok: true, answer: direct };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  // Dev shortcut: Groq direct (OpenAI-compatible) if configured
  if (provider === 'groq' && configuredUrl && configuredUrl.toLowerCase() === 'direct') {
    try { console.info('[llmService] Using Groq direct mode'); } catch {}
    const browserKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!browserKey) {
      return { ok: false, error: 'Groq key missing in frontend env (VITE_GROQ_API_KEY).' };
    }
    try {
      const direct = await callGroqDirect(browserKey, model, messages);
      return { ok: true, answer: direct };
    } catch (e) {
      try { console.warn('[llmService] Groq direct error:', e); } catch {}
      if (isDecommissionedError(e)) {
        const res = await callGroqWithFallback(browserKey, model, messages);
        if (res.ok) return { ok: true, answer: res.answer };
        return { ok: false, error: res.error };
      }
      return { ok: false, error: e?.message || String(e) };
    }
  }

  const payload = { provider, model, messages };

  // Attempt configured URL first
  try {
    const { resp, data } = await callApi(apiUrl, payload);
    if (!resp.ok) {
      // Dev fallback: if /api/chat returns 404 and Gemini browser key exists, call Gemini directly
      const browserKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (provider === 'google' && browserKey) {
        try {
          try { console.info('[llmService] Falling back to Gemini direct'); } catch {}
          const direct = await callGeminiDirect(browserKey, model, messages);
          return { ok: true, answer: direct };
        } catch (e) {
          const msg = (data && (data.error || data.message)) || 'LLM request failed';
          return { ok: false, error: `${msg} (status ${resp.status})` };
        }
      }
      // Dev fallback: Groq direct
      const groqKey = import.meta.env.VITE_GROQ_API_KEY;
      if (provider === 'groq' && groqKey) {
        try {
          try { console.info('[llmService] Falling back to Groq direct'); } catch {}
          const direct = await callGroqDirect(groqKey, model, messages);
          return { ok: true, answer: direct };
        } catch (e) {
          if (isDecommissionedError(e)) {
            const res = await callGroqWithFallback(groqKey, model, messages);
            if (res.ok) return { ok: true, answer: res.answer };
            return { ok: false, error: res.error };
          }
          const msg = (data && (data.error || data.message)) || 'LLM request failed';
          return { ok: false, error: `${msg} (status ${resp.status})` };
        }
      }
      const msg = (data && (data.error || data.message)) || 'LLM request failed';
      return { ok: false, error: `${msg} (status ${resp.status})` };
    }
    const answer = data?.answer || '';
    return { ok: true, answer };
  } catch (err1) {
    // If configured URL is absolute and failed to connect, fall back to same-origin
    try {
      if (configuredUrl && /^https?:\/\//i.test(configuredUrl)) {
        const { resp, data } = await callApi(defaultUrl, payload);
        if (!resp.ok) {
          // Dev fallback on non-OK as well
          const browserKey = import.meta.env.VITE_GEMINI_API_KEY;
          if (provider === 'google' && browserKey) {
            try {
              try { console.info('[llmService] Secondary fallback to Gemini direct'); } catch {}
              const direct = await callGeminiDirect(browserKey, model, messages);
              return { ok: true, answer: direct };
            } catch (e) {
              const msg = (data && (data.error || data.message)) || 'LLM request failed';
              return { ok: false, error: `${msg} (status ${resp.status})` };
            }
          }
          const groqKey = import.meta.env.VITE_GROQ_API_KEY;
          if (provider === 'groq' && groqKey) {
            try {
              try { console.info('[llmService] Secondary fallback to Groq direct'); } catch {}
              const direct = await callGroqDirect(groqKey, model, messages);
              return { ok: true, answer: direct };
            } catch (e) {
              if (isDecommissionedError(e)) {
                const res = await callGroqWithFallback(groqKey, model, messages);
                if (res.ok) return { ok: true, answer: res.answer };
                return { ok: false, error: res.error };
              }
              const msg = (data && (data.error || data.message)) || 'LLM request failed';
              return { ok: false, error: `${msg} (status ${resp.status})` };
            }
          }
          const msg = (data && (data.error || data.message)) || 'LLM request failed';
          return { ok: false, error: `${msg} (status ${resp.status})` };
        }
        const answer = data?.answer || '';
        return { ok: true, answer };
      }
    } catch (err2) {
      // If provider is google and a browser API key exists, try a safe dev-only direct call
      const browserKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (provider === 'google' && browserKey) {
        try {
          try { console.info('[llmService] Tertiary fallback to Gemini direct'); } catch {}
          const direct = await callGeminiDirect(browserKey, model, messages);
          return { ok: true, answer: direct };
        } catch (err3) {
          return { ok: false, error: err3?.message || String(err3) };
        }
      }
      const groqKey = import.meta.env.VITE_GROQ_API_KEY;
      if (provider === 'groq' && groqKey) {
        try {
          try { console.info('[llmService] Tertiary fallback to Groq direct'); } catch {}
          const direct = await callGroqDirect(groqKey, model, messages);
          return { ok: true, answer: direct };
        } catch (err3) {
          if (isDecommissionedError(err3)) {
            const res = await callGroqWithFallback(groqKey, model, messages);
            if (res.ok) return { ok: true, answer: res.answer };
            return { ok: false, error: res.error };
          }
          return { ok: false, error: err3?.message || String(err3) };
        }
      }
      return { ok: false, error: (err2?.message || String(err2)) };
    }
    return { ok: false, error: err1.message || String(err1) };
  }
}
