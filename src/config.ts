import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  slack: {
    botToken: requireEnv('SLACK_BOT_TOKEN'),
    appToken: requireEnv('SLACK_APP_TOKEN'),
  },
  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  },
  supabase: {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },
};
