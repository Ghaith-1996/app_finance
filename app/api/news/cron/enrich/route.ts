import { createServiceClient } from "@/lib/supabase/service";
import { ingestNewsToSupabase } from "@/lib/services/news";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron-enrich");

const MAX_BATCH_SIZE = 10;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function runEnrich(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: "CRON_SECRET not configured" }, 500);
  }

  const auth = request.headers.get("authorization") ?? "";
  const { isTimingSafeEqual } = await import("@/lib/security/timing");
  if (!isTimingSafeEqual(auth, `Bearer ${secret}`)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).articleIds)) {
    return json({ error: "Body must contain articleIds array" }, 400);
  }

  const articleIds = (body as { articleIds: unknown[] }).articleIds;

  if (articleIds.length === 0) {
    return json({ error: "articleIds must not be empty" }, 400);
  }

  if (articleIds.length > MAX_BATCH_SIZE) {
    return json({ error: `articleIds exceeds max batch size of ${MAX_BATCH_SIZE}` }, 400);
  }

  const ids = articleIds.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) {
    return json({ error: "articleIds contains no valid IDs" }, 400);
  }

  log.info("Enrich batch started", { requested: ids.length });

  const supabase = createServiceClient();
  const result = await ingestNewsToSupabase(supabase, { articleIds: ids });

  log.info("Enrich batch completed", {
    requested: ids.length,
    enriched: result.enriched,
    skipped: result.skipped,
    error: result.error ?? null,
  });

  if (result.error) {
    return json({
      requested: ids.length,
      enriched: result.enriched,
      skipped: result.skipped,
      error: result.error,
    }, 500);
  }

  return json({
    requested: ids.length,
    enriched: result.enriched,
    skipped: result.skipped,
    error: null,
  });
}

export async function POST(request: Request) {
  return runEnrich(request);
}
