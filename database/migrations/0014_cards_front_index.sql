-- Warm-up "show answer" looks up cards by front (optionally scoped to topic).
CREATE INDEX IF NOT EXISTS idx_cards_front ON cards(front);
CREATE INDEX IF NOT EXISTS idx_cards_topic_front ON cards(topic_id, front);
