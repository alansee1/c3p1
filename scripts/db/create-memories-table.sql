-- Run this in Supabase SQL Editor to create the memories table
-- Stores C3P1's persistent memory files

CREATE TABLE memories (
  id SERIAL PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,  -- e.g., '/memories/alan_preferences.md'
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memories_path ON memories(path);

-- Enable RLS but allow service_role full access
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to memories"
  ON memories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
