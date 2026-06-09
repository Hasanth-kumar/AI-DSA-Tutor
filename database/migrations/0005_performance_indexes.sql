CREATE INDEX IF NOT EXISTS idx_problems_topic_id ON problems(topic_id);
CREATE INDEX IF NOT EXISTS idx_problems_status_topic ON problems(status, topic_id);
CREATE INDEX IF NOT EXISTS idx_sessions_topic_id ON sessions(topic_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date DESC);
CREATE INDEX IF NOT EXISTS idx_topics_next_revision ON topics(next_revision_at);
