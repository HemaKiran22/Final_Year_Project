export const config = { runtime: 'nodejs' };

import { answerQuestion, getLatestChatQuestion } from '../server/rag.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const messages = Array.isArray(body.messages)
      ? body.messages.filter((message) => message && message.content != null)
      : [];
    const question = getLatestChatQuestion(messages);

    if (!question) {
      return res.status(400).json({ error: 'A user question is required' });
    }

    const { answer, sources } = await answerQuestion(question, messages);
    return res.status(200).json({ answer, sources });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) });
  }
}
