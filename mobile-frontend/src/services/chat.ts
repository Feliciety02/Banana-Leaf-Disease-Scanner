import { api } from './api';

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatReply = {
  reply: string;
  notice: string;
};

/** `diagnosisId` lets the server add that scan's result and review; the app never sends the details itself. */
export async function askAssistant(messages: ChatTurn[], diagnosisId?: number | null): Promise<ChatReply> {
  const transcript = messages
    .slice(-8)
    .map(({ role, content }) => ({ role, content: content.trim() }))
    .filter(({ content }) => content.length > 0);

  const payload = await api<ChatReply>('/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: transcript, ...(diagnosisId ? { diagnosis_id: diagnosisId } : {}) }),
  });

  return payload.data;
}
