-- Track quiz ideas we've already suggested
CREATE TABLE suggested_quizzes (
  id SERIAL PRIMARY KEY,
  quiz_name TEXT NOT NULL,           -- Normalized name for deduplication
  hook TEXT,                         -- The event that triggered this suggestion
  suggested_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(quiz_name)
);

-- Index for checking if we've suggested a quiz
CREATE INDEX idx_suggested_quizzes_name ON suggested_quizzes(quiz_name);
