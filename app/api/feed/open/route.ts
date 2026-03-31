import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);
  const newsItemId =
    body && typeof body.newsItemId === "string" ? body.newsItemId.trim() : "";

  if (!newsItemId) {
    return json({ error: "newsItemId is required" }, 400);
  }

  const serviceSupabase = createServiceClient();
  const { data, error } = await serviceSupabase.rpc(
    "increment_news_item_detail_open_count",
    { target_news_item_id: newsItemId },
  );

  if (error) {
    return json({ error: error.message }, 500);
  }
  if (typeof data !== "number") {
    return json({ error: "News item not found" }, 404);
  }

  return json({ ok: true, detailOpenCount: data });
}
