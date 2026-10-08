-- Review R3: snapshots carry the unit of their totals; rows written without it stay NULL (legacy).
BEGIN;

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000041a1', 'snap-041@example.test');
INSERT INTO portfolios (id, user_id, name)
VALUES ('00000000-0000-0000-0000-0000000041b1', '00000000-0000-0000-0000-0000000041a1', 'Snapshots 041');

DO $$
DECLARE
  p CONSTANT UUID := '00000000-0000-0000-0000-0000000041b1';
  u CONSTANT UUID := '00000000-0000-0000-0000-0000000041a1';
BEGIN
  -- A writer that predates 041 (no valuation_version) produces a legacy row.
  INSERT INTO portfolio_value_snapshots (portfolio_id, user_id, bucket_start, total_value)
  VALUES (p, u, '2026-10-01T10:00:00Z', 100);
  INSERT INTO portfolio_value_snapshots (portfolio_id, user_id, bucket_start, total_value, valuation_version)
  VALUES (p, u, '2026-10-02T10:00:00Z', 73, 2);

  ASSERT (SELECT valuation_version FROM portfolio_value_snapshots
          WHERE portfolio_id = p AND bucket_start = '2026-10-01T10:00:00Z') IS NULL, 'legacy row got a version';
  ASSERT (SELECT count(*) FROM portfolio_value_snapshots WHERE portfolio_id = p AND valuation_version = 2) = 1,
    'versioned row not stored';
END $$;

ROLLBACK;
