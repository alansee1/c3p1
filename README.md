# C3P1

Personal AI assistant running on Raspberry Pi 5, integrated with Slack.

## Architecture

- **Slack Bot**: Socket Mode for real-time messaging
- **LLM**: Claude API (Sonnet by default)
- **Database**: Supabase (PostgreSQL) for work items and conversation history
- **Runtime**: Node.js with TypeScript

## Deployment

Code runs on the Pi. To deploy changes:

1. Push to main from your dev machine
2. SSH to the Pi and run `./c3p1/deploy.sh`

The deploy script pulls latest, builds, and restarts the systemd service (`cortana`).

## Local Development

```bash
npm install
npm run dev
```

## Environment Variables

Create `.env` with:

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # optional
```

## Database Setup

Run these SQL scripts in Supabase SQL Editor:

1. `scripts/create-query-function.sql` - Enables raw SELECT queries via RPC
2. `scripts/create-messages-table.sql` - Conversation history storage

## Project Structure

```
src/
  config.ts          # Environment variable loading
  index.ts           # Entry point
  db/
    client.ts        # Supabase client
    queries.ts       # Database query functions
    types.ts         # TypeScript types for DB entities
  llm/
    client.ts        # Claude API integration
    conversation.ts  # Conversation history management
    system-prompt.ts # C3P1's personality and instructions
    tools.ts         # Tool definitions for Claude
    tool-executor.ts # Tool execution logic
  slack/
    app.ts           # Slack app initialization
    handlers.ts      # Message and mention handlers
```
