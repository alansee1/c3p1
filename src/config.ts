import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

type LlmProvider = 'anthropic' | 'openai';
type LlmTaskKey = 'conversation' | 'quizIdeas' | 'quizScanner';

function getLlmProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  if (raw === 'anthropic' || raw === 'openai') {
    return raw;
  }
  throw new Error(`Unsupported LLM_PROVIDER: ${raw}`);
}

const llmProvider = getLlmProvider();
const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const openaiModel = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

function getTaskOverride(taskKey: string) {
  const envPrefix = `LLM_${taskKey.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
  const provider = process.env[`${envPrefix}_PROVIDER`];
  const model = process.env[`${envPrefix}_MODEL`];

  if (!provider && !model) {
    return null;
  }

  if (provider && provider !== 'anthropic' && provider !== 'openai') {
    throw new Error(`Unsupported ${envPrefix}_PROVIDER: ${provider}`);
  }

  return {
    provider: (provider as LlmProvider | undefined) || null,
    model: model || null,
  };
}

export const config = {
  slack: {
    botToken: requireEnv('SLACK_BOT_TOKEN'),
    appToken: requireEnv('SLACK_APP_TOKEN'),
    notificationChannel: process.env.SLACK_NOTIFICATION_CHANNEL || 'C0AFW2TSTF1',
  },
  llm: {
    provider: llmProvider,
    model: process.env.LLM_MODEL || (llmProvider === 'openai' ? openaiModel : anthropicModel),
    apiKey: llmProvider === 'openai'
      ? requireEnv('OPENAI_API_KEY')
      : requireEnv('ANTHROPIC_API_KEY'),
    tasks: {
      conversation: getTaskOverride('conversation'),
      quizIdeas: getTaskOverride('quizIdeas'),
      quizScanner: getTaskOverride('quizScanner'),
    } as Record<LlmTaskKey, { provider: LlmProvider | null; model: string | null } | null>,
  },
  anthropic: {
    apiKey: getOptionalEnv('ANTHROPIC_API_KEY'),
    model: anthropicModel,
  },
  openai: {
    apiKey: getOptionalEnv('OPENAI_API_KEY'),
    model: openaiModel,
  },
  supabase: {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },
  twitter: {
    apiKey: process.env.TWITTER_API_KEY,
    apiKeySecret: process.env.TWITTER_API_KEY_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
  },
};
