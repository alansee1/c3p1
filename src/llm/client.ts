import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { SYSTEM_PROMPT } from './system-prompt';
import { tools } from './tools';
import { executeTool, ToolContext } from './tool-executor';
import { logApiUsage } from '../db/queries';

const client = new Anthropic({
  apiKey: config.anthropic.apiKey,
  maxRetries: 3, // Auto-retry on 429/529 errors with exponential backoff
});

type MessageParam = Anthropic.MessageParam;
type ContentBlock = Anthropic.ContentBlock;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;

export interface SimpleMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Convert simple message history to API format
function toApiMessages(history: SimpleMessage[]): MessageParam[] {
  return history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

// Extract text from content blocks
function extractText(content: ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export async function generateResponse(
  history: SimpleMessage[],
  conversationKey?: string
): Promise<string> {
  const messages: MessageParam[] = toApiMessages(history);
  const maxIterations = 10; // Safety limit

  // Build tool context for action logging
  const toolContext: ToolContext | undefined = conversationKey
    ? { triggerType: 'conversation', triggerRef: conversationKey }
    : undefined;

  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Track token usage
    totalTokensIn += response.usage.input_tokens;
    totalTokensOut += response.usage.output_tokens;

    // Check if we need to handle tool use
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    // If no tool use, return the text response
    if (toolUseBlocks.length === 0) {
      // Log total API usage for this conversation turn
      if (conversationKey) {
        logApiUsage('conversation', conversationKey, totalTokensIn, totalTokensOut).catch((err) =>
          console.error('[API_USAGE] Failed to log:', err)
        );
      }
      const text = extractText(response.content);
      return text || 'I seem to have generated an empty response.';
    }

    // Execute all tool calls
    const toolResults: ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (toolUse) => {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          toolContext
        );
        return {
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: result,
        };
      })
    );

    // Add assistant message with tool use to conversation
    messages.push({
      role: 'assistant',
      content: response.content,
    });

    // Add tool results to conversation
    messages.push({
      role: 'user',
      content: toolResults,
    });

    // If stop_reason is end_turn after tool use, extract any text
    if (response.stop_reason === 'end_turn') {
      // Log total API usage for this conversation turn
      if (conversationKey) {
        logApiUsage('conversation', conversationKey, totalTokensIn, totalTokensOut).catch((err) =>
          console.error('[API_USAGE] Failed to log:', err)
        );
      }
      const text = extractText(response.content);
      if (text) return text;
    }

    // Continue loop to get next response
  }

  // Log API usage even on loop timeout
  if (conversationKey) {
    logApiUsage('conversation', conversationKey, totalTokensIn, totalTokensOut).catch((err) =>
      console.error('[API_USAGE] Failed to log:', err)
    );
  }

  return 'I seem to have gotten stuck in a loop. Please try rephrasing your request.';
}
