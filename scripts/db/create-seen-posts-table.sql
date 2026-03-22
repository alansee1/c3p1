-- Track posts we've already seen/processed
CREATE TABLE seen_posts (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL,          -- 'reddit', 'twitter', etc.
  post_id TEXT NOT NULL,           -- Platform-specific ID
  post_url TEXT NOT NULL,
  title TEXT,
  subreddit TEXT,                  -- Reddit-specific
  author TEXT,
  found_at TIMESTAMPTZ DEFAULT NOW(),
  notified BOOLEAN DEFAULT FALSE,  -- Did we send to Slack?
  UNIQUE(platform, post_id)
);

-- Index for checking if we've seen a post
CREATE INDEX idx_seen_posts_platform_post ON seen_posts(platform, post_id);
