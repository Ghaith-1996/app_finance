-- Legacy rows as they exist before 033: a USD and a CAD holding with quotes but no FX columns.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000aa33', 'legacy-033@example.test');
INSERT INTO portfolios (id, user_id, name) VALUES
  ('00000000-0000-0000-0000-00000000ab33', '00000000-0000-0000-0000-00000000aa33', 'Legacy');
INSERT INTO holdings (id, portfolio_id, symbol, company, sector, market, quantity, average_cost, current_price, quote_currency, quote_as_of) VALUES
  ('00000000-0000-0000-0000-00000000ac01', '00000000-0000-0000-0000-00000000ab33', 'AAPL', 'Apple', 'Tech', 'US', 1, 1, 100, 'USD', '2026-09-30T20:00:00Z'),
  ('00000000-0000-0000-0000-00000000ac02', '00000000-0000-0000-0000-00000000ab33', 'SHOP.TO', 'Shopify', 'Tech', 'TSX', 1, 1, 100, 'CAD', '2026-09-30T20:00:00Z');
