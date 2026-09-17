jest.mock('../api', () => ({
  api: jest.fn(),
}));

import { api } from '../api';
import { askAssistant, ChatTurn } from '../chat';

const mockedApi = api as jest.MockedFunction<typeof api>;

describe('chat service', () => {
  beforeEach(() => mockedApi.mockReset());

  it('sends only the latest eight trimmed turns through the authenticated backend API', async () => {
    mockedApi.mockResolvedValue({
      success: true,
      message: 'ok',
      data: { reply: 'Short answer', notice: 'AI notice' },
    });
    const messages: ChatTurn[] = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `  message ${index}  `,
    }));

    await expect(askAssistant(messages)).resolves.toEqual({ reply: 'Short answer', notice: 'AI notice' });
    expect(mockedApi).toHaveBeenCalledWith('/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: messages.slice(-8).map(({ role, content }) => ({ role, content: content.trim() })) }),
    });
  });
});
