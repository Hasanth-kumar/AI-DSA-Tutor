CREATE INDEX IF NOT EXISTS idx_sessions_topic_date ON sessions(topic_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
