export const config = { runtime: "nodejs" };

function toGeminiContents(messages = []) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }]
  }));
}

export default async function handler(req, res) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const provider = (body.provider || 'openai').toLowerCase();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const model = body.model || (provider === 'google' ? (process.env.GOOGLE_MODEL || 'gemini-1.5-flash-latest') : 'gpt-4o-mini');

    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        return res.status(400).json({ error: 'OPENAI_API_KEY not set on server' });
      }
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${key}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model, messages, temperature: 0.5 })
      });
      const data = await resp.json();
      if (!resp.ok) {
        return res.status(resp.status).json({ error: data.error || data });
      }
      const answer = data?.choices?.[0]?.message?.content || '';
      return res.status(200).json({ answer });
    }

    if (provider === 'groq') {
      const key = process.env.GROQ_API_KEY;
      if (!key) {
        return res.status(400).json({ error: 'GROQ_API_KEY not set on server' });
      }
      const payload = {
        model,
        messages: messages.map(m => ({ role: m.role, content: String(m.content || '') })),
        temperature: 0.5,
        stream: false,
      };
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${key}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) {
        return res.status(resp.status).json({ error: data.error || data });
      }
      const answer = data?.choices?.[0]?.message?.content || '';
      return res.status(200).json({ answer });
    }

    if (provider === 'google') {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) {
        return res.status(400).json({ error: 'GEMINI_API_KEY not set on server' });
      }
      // Build a simple text prompt from chat history
      const prompt = messages.map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n');
      try {
        const genAI = new GoogleGenerativeAI(key);
        const mdl = genAI.getGenerativeModel({ model: model || 'gemini-pro' });
        const result = await mdl.generateContent(prompt);
        const answer = result?.response?.text?.() || '';
        return res.status(200).json({ answer });
      } catch (e) {
        return res.status(500).json({ error: e?.message || String(e) });
      }
    }

    return res.status(400).json({ error: 'Unsupported provider' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
