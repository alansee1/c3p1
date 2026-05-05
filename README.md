# C3P1

Personal AI assistant running on Raspberry Pi 5, integrated with Slack.

## Architecture

- **Slack Bot**: Socket Mode for real-time messaging
- **LLM**: Configurable provider layer (`anthropic` or `openai`)
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
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
LLM_PROVIDER=anthropic  # or openai
LLM_MODEL=claude-sonnet-4-20250514  # optional provider override
ANTHROPIC_API_KEY=sk-ant-...        # required when LLM_PROVIDER=anthropic
OPENAI_API_KEY=sk-...               # required when LLM_PROVIDER=openai
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # optional anthropic default
OPENAI_MODEL=gpt-5.4-mini                 # optional openai default
LLM_CONVERSATION_PROVIDER=anthropic       # optional per-task override
LLM_CONVERSATION_MODEL=claude-sonnet-4-20250514
LLM_QUIZ_IDEAS_PROVIDER=openai
LLM_QUIZ_IDEAS_MODEL=gpt-5.4-mini
LLM_QUIZ_SCANNER_PROVIDER=openai
LLM_QUIZ_SCANNER_MODEL=gpt-5.4-mini
```

## Database Setup

Run these SQL scripts in Supabase SQL Editor:

1. `scripts/create-query-function.sql` - Enables raw SELECT queries via RPC
2. `scripts/create-messages-table.sql` - Conversation history storage
3. `scripts/create-memories-table.sql` - Persistent memory for learning/adaptation

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
    client.ts        # Shared LLM entrypoint
    provider.ts      # Provider selection + Anthropic/OpenAI adapters
    conversation.ts  # Conversation history management
    system-prompt.ts # C3P1's personality and instructions
    tools.ts         # Tool definitions for Anthropic tool use
    tool-executor.ts # Tool execution logic
  slack/
    app.ts           # Slack app initialization
    handlers.ts      # Message and mention handlers
```

## Work Tracking

C3P1 now has higher-level work-tracking workflows on top of the shared Supabase `projects` / `works` tables:

- `list_projects` - see active projects
- `list_work_items` - inspect pending, in-progress, or recent completed work
- `add_work_item` - create a pending item for later
- `start_work_item` - move a pending item into `in_progress`
- `create_and_start_work_item` - create an ad-hoc item and start it immediately
- `complete_work_item` - finish an in-progress item with a completed summary

That means chat flows can mirror the Codex/project workflow more closely:
- "What's on my plate?"
- "Add a work item for c3p1: add OpenAI tool calling"
- "Start work on the provider config item"
- "Log that I finished the provider abstraction"
- "Create 10 largest-cities quizzes for quizio"

Ownership semantics:
- user-directed work logged through chat should be stored as `manual`
- reserve `c3p1` for bot-initiated/autonomous work
- completed items can now track `completed_by_agent` separately from `source_agent`
- `completed_by_agent` should only be `manual` or `c3p1`

## Automation Jobs

C3P1 now has a first-class `automation_jobs` layer for machine execution, linked to human-readable `works` items.

- `create_quiz_batch_job` creates:
  - a started work item
  - a queued automation job linked to that work item
- `list_automation_jobs` lets you inspect queued/running/completed/failed jobs

This is the foundation for the eventual flow:
- ask for 10 quizzes
- start work
- run the batch
- log what got created
