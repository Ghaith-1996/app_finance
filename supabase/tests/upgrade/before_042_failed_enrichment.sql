-- A terminal enrichment failure written before 042 (no settle stamp).
INSERT INTO news_items (id, headline, source, published_at, created_at, enrichment_status, enrichment_attempts, global_summary, overall_effect)
VALUES ('00000000-0000-0000-0000-0000000042a1', 'Outage casualty', 'Wire', '2026-10-05T12:00:00Z',
        '2026-10-05T12:01:00Z', 'failed', 5, 'Fallback snippet', 'neutral');
