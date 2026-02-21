-- Action receipts for tracking what C3P1 does
CREATE TABLE action_receipts (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'c3p1',
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('conversation', 'background', 'scheduled')),
  trigger_ref TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by trigger
CREATE INDEX idx_action_receipts_trigger ON action_receipts(trigger_type, trigger_ref);

-- Index for querying by action type
CREATE INDEX idx_action_receipts_action_type ON action_receipts(action_type);

-- Index for time-based queries
CREATE INDEX idx_action_receipts_created_at ON action_receipts(created_at DESC);
