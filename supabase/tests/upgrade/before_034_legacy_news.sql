-- Legacy news rows before 034: one enriched, one never enriched (global_summary NULL).
INSERT INTO news_items (id, headline, source, published_at, global_summary, overall_effect) VALUES
  ('00000000-0000-0000-0000-00000000ad01', 'Enriched', 'Wire', '2026-09-30T12:00:00Z', 'summary', 'neutral');
INSERT INTO news_items (id, headline, source, published_at) VALUES
  ('00000000-0000-0000-0000-00000000ad02', 'Not enriched', 'Wire', '2026-09-30T12:00:00Z');
