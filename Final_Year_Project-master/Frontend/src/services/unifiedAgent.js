import { sendChatMessage, toChatMessages } from './chatbotService';

export const createInitialState = () => ({
  conversationState: 'idle',
  history: [],
});

export async function handleUserMessage(text, userId, db, auth, userName, state = createInitialState(), history = []) {
  try {
    const messages = [
      ...toChatMessages(history),
      { role: 'user', content: String(text || '') },
    ];

    const response = await sendChatMessage(messages);

    return {
      result: {
        type: 'text',
        text: response.answer || 'I do not have an answer for that yet.',
        sources: response.sources || [],
      },
      newState: state,
    };
  } catch (error) {
    return {
      result: {
        type: 'text',
        text: `⚠️ ${error?.message || 'Unable to reach the chatbot service.'}`,
        sources: [],
      },
      newState: state,
    };
  }
}
