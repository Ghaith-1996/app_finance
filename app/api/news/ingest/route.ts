import { createClient } from "@/lib/supabase/server";
import { ingestNewsToSupabase } from "@/lib/services/news/ingest";

/**
 * POST /api/news/ingest
 * Fetches news from the configured provider and inserts into news_items.
 * Automatically passes the user's holding tickers so MarketAux returns relevant articles.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  let tickers: string[] = [];
  if (portfolios?.[0]) {
    const { data: holdings } = await supabase
      .from("holdings")
      .select("symbol")
      .eq("portfolio_id", portfolios[0].id);
    tickers = (holdings ?? []).map((h) => h.symbol as string);
  }

  const result = await ingestNewsToSupabase(supabase, { tickers });
  if (result.error) {
    return new Response(
      JSON.stringify({ error: result.error, inserted: result.inserted, skipped: result.skipped }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  return new Response(
    JSON.stringify({ ok: true, inserted: result.inserted, skipped: result.skipped }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
