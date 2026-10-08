import { createServiceClient } from "@/lib/supabase/service";
import { countDueEnrichmentBacklog, ingestNewsToSupabase } from "@/lib/services/news";
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

  if (!body || typeof body !== "object") {
    return json({ error: "Body must be a JSON object" }, 400);
  }
  const parsed = body as Record<string, unknown>;
  const supabase = createServiceClient();

  // Backlog mode (audit J1): enrich whatever unfinished work is due, independent of which run
  // inserted it, and report what remains so the scheduler can keep draining.
  if (parsed.backlog === true) {
    const limit =
      typeof parsed.limit === "number" && Number.isInteger(parsed.limit)
        ? Math.min(Math.max(parsed.limit, 1), MAX_BATCH_SIZE)
        : MAX_BATCH_SIZE;
    log.info("Enrich backlog batch started", { limit });
    const result = await ingestNewsToSupabase(supabase, { limit });
    const remaining = await countDueEnrichmentBacklog(supabase);
    log.info("Enrich backlog batch completed", {
      enriched: result.enriched,
      retrying: result.retrying,
      failed: result.failed,
      skipped: result.skipped,
      remaining: remaining.count,
      error: result.error ?? remaining.error ?? null,
    });
    const error = result.error ?? remaining.error ?? null;
    return json(
      {
        enriched: result.enriched,
        retrying: result.retrying,
        failed: result.failed,
        skipped: result.skipped,
        remaining: remaining.count,
        error,
      },
      error ? 500 : 200,
    );
  }

  if (!Array.isArray(parsed.articleIds)) {
    return json({ error: "Body must contain articleIds array or backlog: true" }, 400);
  }

  const articleIds = parsed.articleIds as unknown[];

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

  const result = await ingestNewsToSupabase(supabase, { articleIds: ids });

  log.info("Enrich batch completed", {
    requested: ids.length,
    enriched: result.enriched,
    retrying: result.retrying,
    failed: result.failed,
    skipped: result.skipped,
    error: result.error ?? null,
  });

  if (result.error) {
    return json({
      requested: ids.length,
      enriched: result.enriched,
      retrying: result.retrying,
      failed: result.failed,
      skipped: result.skipped,
      error: result.error,
    }, 500);
  }

  return json({
    requested: ids.length,
    enriched: result.enriched,
    retrying: result.retrying,
    failed: result.failed,
    skipped: result.skipped,
    error: null,
  });
}

export async function POST(request: Request) {
  return runEnrich(request);
}
