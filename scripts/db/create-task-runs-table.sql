-- Task runs for tracking background/scheduled job executions
CREATE TABLE task_runs (
  id SERIAL PRIMARY KEY,
  task_name TEXT NOT NULL,
  agent_id TEXT NOT NULL DEFAULT 'c3p1',
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  result_summary TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by task name
CREATE INDEX idx_task_runs_task_name ON task_runs(task_name);

-- Index for time-based queries
CREATE INDEX idx_task_runs_started_at ON task_runs(started_at DESC);

-- Index for status queries
CREATE INDEX idx_task_runs_status ON task_runs(status);
