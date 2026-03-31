import { createClient } from "@/lib/supabase/server";
import {
  parseFeedPage,
  parseFeedPageSize,
  resolveFeedPayload,
} from "@/lib/server/feed";
import type { FeedMode } from "@/lib/types";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/feed?mode=personal|market&portfolioId=...&holding=...&sector=...
 *              &category=...&maxMinutes=...&sort=...&ticker=...&sourceType=...
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { searchParams } = new URL(request.url);
  const mode: FeedMode =
    searchParams.get("mode") === "market" ? "market" : "personal";

  const result = await resolveFeedPayload({
    supabase,
    userId: user.id,
    mode,
    portfolioId: searchParams.get("portfolioId"),
    holding: searchParams.get("holding"),
    sector: searchParams.get("sector"),
    category: searchParams.get("category"),
    maxMinutes: searchParams.get("maxMinutes"),
    sort: searchParams.get("sort"),
    ticker: searchParams.get("ticker"),
    sourceType: searchParams.get("sourceType"),
    page: parseFeedPage(searchParams.get("page")),
    pageSize: parseFeedPageSize(searchParams.get("pageSize")),
  });

  if (!result.ok) {
    return json({ error: result.error }, result.status);
  }

  return json(result.data);
}
