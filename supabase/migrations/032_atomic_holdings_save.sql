-- Audit B1: portfolio imports must be atomic.
--
-- save_portfolio_holdings() validates the complete holdings payload and applies a
-- replace or merge inside the single transaction PostgREST opens for an RPC call.
-- Any validation or write failure raises, which rolls back every write, so a failed
-- replace keeps the previous holdings and a failed merge cannot partially apply.
--
-- SECURITY INVOKER: the caller's RLS policies still apply; ownership is also checked
-- explicitly (and the portfolio row is locked) so concurrent imports serialize.
-- Quote enrichment is intentionally NOT done here; the app refreshes prices after commit.

CREATE OR REPLACE FUNCTION public.save_portfolio_holdings(
  p_portfolio_id UUID,
  p_portfolio_name TEXT,
  p_source_type TEXT,
  p_mode TEXT,
  p_holdings JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_portfolio_id UUID := p_portfolio_id;
  v_count INT;
  v_item JSONB;
  v_symbol TEXT;
  v_quantity NUMERIC;
  v_average_cost NUMERIC;
  v_import_source TEXT;
  v_existing_id UUID;
  v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('replace', 'merge') THEN
    RAISE EXCEPTION 'invalid_holdings: mode must be replace or merge' USING ERRCODE = '22023';
  END IF;

  IF p_holdings IS NULL OR jsonb_typeof(p_holdings) <> 'array' THEN
    RAISE EXCEPTION 'invalid_holdings: holdings must be an array' USING ERRCODE = '22023';
  END IF;

  v_count := jsonb_array_length(p_holdings);
  IF v_count = 0 OR v_count > 1000 THEN
    RAISE EXCEPTION 'invalid_holdings: between 1 and 1000 holdings are required' USING ERRCODE = '22023';
  END IF;

  -- Validate the complete payload before any mutation.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_holdings) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'invalid_holdings: each holding must be an object' USING ERRCODE = '22023';
    END IF;

    v_symbol := upper(btrim(coalesce(v_item->>'symbol', '')));
    IF v_symbol = '' OR length(v_symbol) > 32 OR v_symbol !~ '^[A-Z0-9][A-Z0-9.\-^=:/]*$' THEN
      RAISE EXCEPTION 'invalid_holdings: invalid symbol "%"', left(v_symbol, 40) USING ERRCODE = '22023';
    END IF;
    IF v_symbol = ANY (v_seen) THEN
      RAISE EXCEPTION 'invalid_holdings: duplicate symbol "%"', v_symbol USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_symbol);

    IF jsonb_typeof(v_item->'quantity') <> 'number' OR jsonb_typeof(v_item->'averageCost') <> 'number' THEN
      RAISE EXCEPTION 'invalid_holdings: quantity and averageCost must be numbers for "%"', v_symbol USING ERRCODE = '22023';
    END IF;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_average_cost := (v_item->>'averageCost')::NUMERIC;
    IF v_quantity <= 0 OR v_quantity >= 1e12 THEN
      RAISE EXCEPTION 'invalid_holdings: quantity out of range for "%"', v_symbol USING ERRCODE = '22023';
    END IF;
    IF v_average_cost < 0 OR v_average_cost >= 1e12 THEN
      RAISE EXCEPTION 'invalid_holdings: average cost out of range for "%"', v_symbol USING ERRCODE = '22023';
    END IF;

    v_import_source := coalesce(v_item->>'importSource', 'manual');
    IF v_import_source NOT IN ('csv', 'manual') THEN
      RAISE EXCEPTION 'invalid_holdings: invalid import source for "%"', v_symbol USING ERRCODE = '22023';
    END IF;

    IF length(coalesce(v_item->>'company', '')) > 200
      OR length(coalesce(v_item->>'sector', '')) > 100
      OR length(coalesce(v_item->>'market', '')) > 100
      OR length(coalesce(v_item->>'thesis', '')) > 4000 THEN
      RAISE EXCEPTION 'invalid_holdings: text field too long for "%"', v_symbol USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF v_portfolio_id IS NULL THEN
    INSERT INTO portfolios (user_id, name, source_type, sync_status)
    VALUES (
      v_user_id,
      coalesce(nullif(btrim(p_portfolio_name), ''), 'My Portfolio'),
      coalesce(p_source_type, 'manual')::source_type,
      'active'
    )
    RETURNING id INTO v_portfolio_id;
  ELSE
    PERFORM 1
    FROM portfolios
    WHERE id = v_portfolio_id AND user_id = v_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Portfolio not found or unauthorized' USING ERRCODE = '42501';
    END IF;

    IF p_source_type IS NOT NULL THEN
      UPDATE portfolios
      SET source_type = p_source_type::source_type, updated_at = now()
      WHERE id = v_portfolio_id;
    END IF;
  END IF;

  IF p_mode = 'replace' THEN
    DELETE FROM holdings WHERE portfolio_id = v_portfolio_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_holdings) LOOP
    v_symbol := upper(btrim(v_item->>'symbol'));
    v_import_source := coalesce(v_item->>'importSource', 'manual');
    v_existing_id := NULL;

    IF p_mode = 'merge' THEN
      SELECT id INTO v_existing_id
      FROM holdings
      WHERE portfolio_id = v_portfolio_id AND upper(symbol) = v_symbol
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_existing_id IS NOT NULL THEN
      UPDATE holdings
      SET company = coalesce(nullif(btrim(v_item->>'company'), ''), company),
          quantity = (v_item->>'quantity')::NUMERIC,
          average_cost = (v_item->>'averageCost')::NUMERIC,
          sector = coalesce(nullif(btrim(v_item->>'sector'), ''), sector),
          market = coalesce(nullif(btrim(v_item->>'market'), ''), market),
          source = CASE WHEN v_import_source = 'csv' THEN 'CSV Import' ELSE 'Manual' END,
          thesis = nullif(v_item->>'thesis', ''),
          import_source = v_import_source,
          updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      INSERT INTO holdings (
        portfolio_id, symbol, company, sector, market, source,
        quantity, average_cost, thesis, import_source
      ) VALUES (
        v_portfolio_id,
        v_symbol,
        coalesce(nullif(btrim(v_item->>'company'), ''), v_symbol),
        coalesce(nullif(btrim(v_item->>'sector'), ''), 'Other'),
        coalesce(nullif(btrim(v_item->>'market'), ''), 'US'),
        CASE WHEN v_import_source = 'csv' THEN 'CSV Import' ELSE 'Manual' END,
        (v_item->>'quantity')::NUMERIC,
        (v_item->>'averageCost')::NUMERIC,
        nullif(v_item->>'thesis', ''),
        v_import_source
      );
    END IF;
  END LOOP;

  RETURN v_portfolio_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_portfolio_holdings(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_portfolio_holdings(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;
