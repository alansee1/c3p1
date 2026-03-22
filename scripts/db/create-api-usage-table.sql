-- API usage tracking for cost monitoring
CREATE TABLE api_usage (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'c3p1',
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('conversation', 'background', 'scheduled')),
  trigger_ref TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by trigger
CREATE INDEX idx_api_usage_trigger ON api_usage(trigger_type, trigger_ref);

-- Index for time-based queries and cost aggregation
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at DESC);

-- Index for agent-specific queries
CREATE INDEX idx_api_usage_agent ON api_usage(agent_id);
