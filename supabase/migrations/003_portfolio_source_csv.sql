-- Allow recording CSV-based intake on the portfolio row (not just per-holding import_source)
ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'csv';
