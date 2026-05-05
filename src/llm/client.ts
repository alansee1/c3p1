import { config } from '../config';
import { getLlmProvider, SimpleMessage } from './provider';
import { logApiUsage } from '../db/queries';

export async function generateResponse(
  history: SimpleMessage[],
  conversationKey?: string
): Promise<string> {
  const provider = getLlmProvider('conversation');
  const response = await provider.generateConversation(history, conversationKey);

  if (conversationKey) {
    logApiUsage('conversation', conversationKey, response.usage.inputTokens, response.usage.outputTokens).catch((err) =>
      console.error('[API_USAGE] Failed to log:', err)
    );
  }

  return response.text;
}
