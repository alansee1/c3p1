import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { SYSTEM_PROMPT } from './system-prompt';

const client = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function generateResponse(history: Message[]): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    return 'I seem to have generated an unexpected response type, sir.';
  }

  return content.text;
}
