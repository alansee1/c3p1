import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { SYSTEM_PROMPT } from './system-prompt';
import { tools } from './tools';
import { executeTool, ToolContext } from './tool-executor';
import { getActionReceipts } from '../db/queries';

type MessageParam = Anthropic.MessageParam;
type ContentBlock = Anthropic.ContentBlock;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;

export interface SimpleMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TextGenerationOptions {
  maxTokens?: number;
  model?: string;
  system?: string;
  temperature?: number;
  taskKey?: 'conversation' | 'quizIdeas' | 'quizScanner';
}

export interface JsonGenerationResult<T> {
  data: T | null;
  text: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  generateText(prompt: string, options?: TextGenerationOptions): Promise<{ text: string; usage: LlmUsage }>;
  generateJson<T>(prompt: string, options?: TextGenerationOptions): Promise<JsonGenerationResult<T>>;
  generateConversation(history: SimpleMessage[], conversationKey?: string): Promise<{ text: string; usage: LlmUsage }>;
}

function resolveTaskConfig(options?: TextGenerationOptions): { provider: 'anthropic' | 'openai'; model: string } {
  const override = options?.taskKey ? config.llm.tasks[options.taskKey] : null;
  return {
    provider: override?.provider || config.llm.provider,
    model: options?.model || override?.model || config.llm.model,
  };
}

function extractJson<T>(text: string): T | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

function extractAnthropicText(content: ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function toAnthropicMessages(history: SimpleMessage[]): MessageParam[] {
  return history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

async function buildActionContext(conversationKey: string): Promise<string> {
  const receipts = await getActionReceipts(conversationKey);
  if (receipts.length === 0) return '';

  const actionLines = receipts.map((receipt) => `- ${receipt.action_type}: ${receipt.action_summary}`);
  return `\n\n## Actions Already Taken in This Conversation\n${actionLines.join('\n')}\n\nDo not repeat these actions.`;
}

class AnthropicProvider implements LlmProvider {
  private client: Anthropic;

  constructor() {
    if (!config.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic');
    }

    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
      maxRetries: 3,
    });
  }

  async generateText(
    prompt: string,
    options: TextGenerationOptions = {}
  ): Promise<{ text: string; usage: LlmUsage }> {
    const response = await this.client.messages.create({
      model: resolveTaskConfig(options).model,
      max_tokens: options.maxTokens || 1000,
      system: options.system,
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      text: extractAnthropicText(response.content),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async generateJson<T>(
    prompt: string,
    options: TextGenerationOptions = {}
  ): Promise<JsonGenerationResult<T>> {
    const result = await this.generateText(prompt, options);
    return {
      ...result,
      data: extractJson<T>(result.text),
    };
  }

  async generateConversation(
    history: SimpleMessage[],
    conversationKey?: string
  ): Promise<{ text: string; usage: LlmUsage }> {
    const messages: MessageParam[] = toAnthropicMessages(history);
    const maxIterations = 10;
    const toolContext: ToolContext | undefined = conversationKey
      ? { triggerType: 'conversation', triggerRef: conversationKey }
      : undefined;
    const actionContext = conversationKey ? await buildActionContext(conversationKey) : '';
    const systemPrompt = SYSTEM_PROMPT + actionContext;

    let totalTokensIn = 0;
    let totalTokensOut = 0;

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.client.messages.create({
        model: resolveTaskConfig({ taskKey: 'conversation' }).model,
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages,
      });

      totalTokensIn += response.usage.input_tokens;
      totalTokensOut += response.usage.output_tokens;

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        return {
          text: extractAnthropicText(response.content) || 'I seem to have generated an empty response.',
          usage: { inputTokens: totalTokensIn, outputTokens: totalTokensOut },
        };
      }

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

      messages.push({
        role: 'assistant',
        content: response.content,
      });

      messages.push({
        role: 'user',
        content: toolResults,
      });

      if (response.stop_reason === 'end_turn') {
        const text = extractAnthropicText(response.content);
        if (text) {
          return {
            text,
            usage: { inputTokens: totalTokensIn, outputTokens: totalTokensOut },
          };
        }
      }
    }

    return {
      text: 'I seem to have gotten stuck in a loop. Please try rephrasing your request.',
      usage: { inputTokens: totalTokensIn, outputTokens: totalTokensOut },
    };
  }
}

type OpenAIResponse = {
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function extractOpenAiText(response: OpenAIResponse): string {
  if (response.output_text && response.output_text.length > 0) {
    return response.output_text;
  }

  const chunks: string[] = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' || content.type === 'text') {
        if (content.text) chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n');
}

function toOpenAiInput(history: SimpleMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

class OpenAiProvider implements LlmProvider {
  private readonly apiKey: string;

  constructor() {
    if (!config.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
    }
    this.apiKey = config.openai.apiKey;
  }

  private async createResponse(body: Record<string, unknown>): Promise<OpenAIResponse> {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<OpenAIResponse>;
  }

  async generateText(
    prompt: string,
    options: TextGenerationOptions = {}
  ): Promise<{ text: string; usage: LlmUsage }> {
    const response = await this.createResponse({
      model: resolveTaskConfig(options).model,
      input: prompt,
      instructions: options.system,
      max_output_tokens: options.maxTokens || 1000,
      temperature: options.temperature,
    });

    return {
      text: extractOpenAiText(response),
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      },
    };
  }

  async generateJson<T>(
    prompt: string,
    options: TextGenerationOptions = {}
  ): Promise<JsonGenerationResult<T>> {
    const result = await this.generateText(prompt, options);
    return {
      ...result,
      data: extractJson<T>(result.text),
    };
  }

  async generateConversation(
    history: SimpleMessage[],
    conversationKey?: string
  ): Promise<{ text: string; usage: LlmUsage }> {
    const actionContext = conversationKey ? await buildActionContext(conversationKey) : '';
    const systemPrompt = SYSTEM_PROMPT + actionContext;

    const response = await this.createResponse({
      model: resolveTaskConfig({ taskKey: 'conversation' }).model,
      instructions: systemPrompt,
      input: toOpenAiInput(history),
      max_output_tokens: 1024,
    });

    return {
      text: extractOpenAiText(response) || 'I seem to have generated an empty response.',
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      },
    };
  }
}

let anthropicProviderSingleton: LlmProvider | null = null;
let openAiProviderSingleton: LlmProvider | null = null;

export function getLlmProvider(taskKey?: 'conversation' | 'quizIdeas' | 'quizScanner'): LlmProvider {
  const provider = taskKey
    ? (config.llm.tasks[taskKey]?.provider || config.llm.provider)
    : config.llm.provider;

  if (provider === 'openai') {
    if (!openAiProviderSingleton) {
      openAiProviderSingleton = new OpenAiProvider();
    }
    return openAiProviderSingleton;
  }

  if (!anthropicProviderSingleton) {
    anthropicProviderSingleton = new AnthropicProvider();
  }
  return anthropicProviderSingleton;
}
