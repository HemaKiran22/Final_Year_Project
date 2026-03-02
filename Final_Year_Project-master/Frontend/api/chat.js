export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const model = body.model || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    const key = process.env.GROQ_API_KEY;
    if (!key) return res.status(400).json({ error: 'GROQ_API_KEY not set on server' });
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: messages.map(m => ({ role: m.role, content: String(m.content || '') })), temperature: 0.5, stream: false }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data.error || data });
    return res.status(200).json({ answer: data?.choices?.[0]?.message?.content || '' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
