-- Run this in Supabase SQL Editor to create the messages table
-- Stores conversation history for C3P1

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  conversation_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  agent_id TEXT,  -- null for user messages, 'c3p1' etc for agents
  content TEXT NOT NULL,
  metadata JSONB,  -- flexible storage for tags, tool calls, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_key ON messages(conversation_key);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_agent_id ON messages(agent_id);

-- Enable RLS but allow service_role full access
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to messages"
  ON messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
