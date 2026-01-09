export const config = { runtime: "nodejs" };

function toGeminiContents(messages = []) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }]
  }));
}

export default async function handler(req) {
  import { GoogleGenerativeAI } from "@google/generative-ai";

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
    }
    const body = await req.json().catch(() => ({}));
    const provider = (body.provider || 'openai').toLowerCase();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const model = body.model || (provider === 'google' ? (process.env.GOOGLE_MODEL || 'gemini-1.5-flash-latest') : 'gpt-4o-mini');

    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set on server' }), { status: 400, headers: { 'content-type': 'application/json' } });
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
        return new Response(JSON.stringify({ error: data.error || data }), { status: resp.status, headers: { 'content-type': 'application/json' } });
      }
      const answer = data?.choices?.[0]?.message?.content || '';
      return new Response(JSON.stringify({ answer }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (provider === 'google') {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set on server' }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      // Build a simple text prompt from chat history
      const prompt = messages.map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n');
      try {
        const genAI = new GoogleGenerativeAI(key);
        const mdl = genAI.getGenerativeModel({ model: model || 'gemini-pro' });
        const result = await mdl.generateContent(prompt);
        const answer = result?.response?.text?.() || '';
        return new Response(JSON.stringify({ answer }), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Unsupported provider' }), { status: 400, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
