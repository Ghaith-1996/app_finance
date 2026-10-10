import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsCategory } from "@/lib/types";
import { getAIProvider } from "../ai";
import { toArticleChatError } from "../ai/ai-chat-errors";

export const ENRICHMENT_MAX_ATTEMPTS = 5;
const ENRICHMENT_BASE_BACKOFF_MS = 5 * 60_000;
const ENRICHMENT_MAX_BACKOFF_MS = 6 * 60 * 60_000;
const ENRICHABLE_STATUSES = ["pending", "retrying"];

/** Delay before the next attempt after `attempts` failures (5 min, 10, 20, … capped at 6 h). */
export function enrichmentBackoffMs(attempts: number): number {
  return Math.min(ENRICHMENT_BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), ENRICHMENT_MAX_BACKOFF_MS);
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

/**
 * Run AI enrichment on articles whose enrichment is unfinished (audit J1/J3).
 *
 * Work comes from the durable `enrichment_status` backlog — pending, or retrying with its backoff
 * elapsed — not from the IDs one ingest run inserted, so work left by a crash is picked up later.
 * An AI failure leaves the article retryable (status `retrying`, attempts/backoff recorded) and does
 * not store fallback text; only after ENRICHMENT_MAX_ATTEMPTS does it become `failed`, with fallback
 * display text that is still never treated as successful enrichment. Each attempt is claimed with a
 * write conditional on the attempt count read before the provider is called, so two concurrent
 * workers cannot both run or record the same attempt.
 *
 * Source-trust rules:
 * - edgar: provider stock_tags are authoritative (SEC-confirmed tickers).
 * - finnhub: provider stock_tags come from the targeted holding/news relationship and are kept as hints.
 * - newsapi / gnews: usually no provider tickers; AI derives stock_tags from text.
 */
export async function ingestNewsToSupabase(
  supabase: SupabaseClient,
  options?: {
    /** Only enrich these specific article IDs (still only if their enrichment is unfinished). */
    articleIds?: string[];
    /** Only enrich articles from these source types. */
    sourceTypes?: string[];
    /** Max articles to enrich in one call (default 20). */
    limit?: number;
    now?: Date;
  }
): Promise<{ enriched: number; skipped: number; retrying: number; failed: number; error?: string }> {
  const ai = getAIProvider();
  const now = options?.now ?? new Date();
  const nowIso = now.toISOString();

  let query = supabase
    .from("news_items")
    .select("id, headline, source, raw_content, full_content, stock_tags, source_type, category_hint, enrichment_attempts")
    .in("enrichment_status", ENRICHABLE_STATUSES)
    .order("published_at", { ascending: false });

  if (options?.articleIds?.length) {
    query = query.in("id", options.articleIds);
  } else {
    query = query
      .or(`enrichment_next_attempt_at.is.null,enrichment_next_attempt_at.lte.${nowIso}`)
      .limit(options?.limit ?? 20);
  }

  if (options?.sourceTypes?.length) {
    query = query.in("source_type", options.sourceTypes);
  }

  const { data: articles, error: fetchError } = await query;

  if (fetchError) {
    return { enriched: 0, skipped: 0, retrying: 0, failed: 0, error: fetchError.message };
  }

  let enriched = 0;
  let skipped = 0;
  let retrying = 0;
  let failed = 0;

  for (const article of articles ?? []) {
    const providerTags = (article.stock_tags as string[]) ?? [];
    const fullText = (article.full_content as string | null) || null;
    const rawText = (article.raw_content as string | null) || null;
    const articleBody = fullText ?? rawText ?? "";
    const attemptsBefore = Number(article.enrichment_attempts ?? 0);
    const attempts = attemptsBefore + 1;

    // Claim the attempt before calling the provider (review P2): only the worker whose conditional
    // update wins calls it, so overlapping runs neither double provider traffic nor let one's timeout
    // overwrite another's success. The claim moves the next attempt out by the normal backoff (longer
    // than the AI request timeout), so a worker that dies mid-call leaves the article due again later
    // with the attempt counted. Explicit-ID runs skip the select's due filter, so the claim checks it.
    const { data: claimed, error: claimError } = await supabase
      .from("news_items")
      .update({
        enrichment_attempts: attempts,
        enrichment_next_attempt_at: new Date(now.getTime() + enrichmentBackoffMs(attempts)).toISOString(),
      })
      .eq("id", article.id as string)
      .eq("enrichment_attempts", attemptsBefore)
      .or(`enrichment_next_attempt_at.is.null,enrichment_next_attempt_at.lte.${nowIso}`)
      .select("id");

    if (claimError) {
      return { enriched, skipped, retrying, failed, error: claimError.message };
    }
    if (!Array.isArray(claimed) || claimed.length === 0) {
      // Another worker claimed or recorded this attempt first.
      skipped++;
      continue;
    }

    let update: Record<string, unknown>;
    try {
      const analysis = await ai.analyzeArticle(
        article.headline as string,
        articleBody,
        providerTags.length > 0 ? providerTags : undefined,
      );

      // edgar: trust the provider's stock_tags entirely (SEC-confirmed tickers).
      // finnhub/newsapi/gnews: prefer AI tags, fall back to provider hints.
      const finalStockTags =
        article.source_type === "edgar" && providerTags.length > 0
          ? providerTags
          : analysis.stockTags.length > 0
            ? analysis.stockTags
            : providerTags;

      update = {
        category: analysis.category,
        stock_tags: finalStockTags,
        global_summary: analysis.globalSummary,
        overall_effect: analysis.overallEffect,
        ticker_impacts: analysis.tickerImpacts,
        enrichment_status: "succeeded",
        enrichment_attempts: attempts,
        enrichment_next_attempt_at: null,
        enrichment_last_error: null,
        // Time of this article's write, not the batch start: the analysis cron compares it with run
        // start times, and a batch-start stamp could predate a run that never saw the article (R7).
        enriched_at: new Date().toISOString(),
      };
    } catch (error) {
      const { code } = toArticleChatError(error);
      if (code === "provider_auth" || code === "provider_rate_limited") {
        // Provider-wide refusal (key, access, quota): the article is not at fault, so give the attempt
        // back and stop the batch rather than exhausting every article's retries. The claim's backoff
        // stays, and the error fails the run so the outage is visible.
        const { error: refundError } = await supabase
          .from("news_items")
          .update({ enrichment_attempts: attemptsBefore, enrichment_last_error: errorMessage(error) })
          .eq("id", article.id as string)
          .eq("enrichment_attempts", attempts);
        const message = `${code}: ${errorMessage(error)}`;
        return { enriched, skipped, retrying, failed, error: refundError ? `${message}; ${refundError.message}` : message };
      }
      if (attempts >= ENRICHMENT_MAX_ATTEMPTS) {
        // Terminal: keep something readable for the feed, but never mark it as enriched.
        update = {
          category: (article.category_hint ?? "other") as NewsCategory,
          global_summary: articleBody.slice(0, 300) || (article.headline as string),
          overall_effect: "neutral",
          enrichment_status: "failed",
          enrichment_attempts: attempts,
          enrichment_next_attempt_at: null,
          enrichment_last_error: errorMessage(error),
          // Settle time, not proof of enrichment (the status says that): the analysis cron's work
          // watermark must see this fallback article, or a provider outage hides it from feeds.
          enriched_at: new Date().toISOString(),
        };
      } else {
        update = {
          enrichment_status: "retrying",
          enrichment_attempts: attempts,
          enrichment_next_attempt_at: new Date(now.getTime() + enrichmentBackoffMs(attempts)).toISOString(),
          enrichment_last_error: errorMessage(error),
        };
      }
    }

    const { data: written, error: updateError } = await supabase
      .from("news_items")
      .update(update)
      .eq("id", article.id as string)
      .eq("enrichment_attempts", attempts)
      .select("id");

    if (updateError) {
      return { enriched, skipped, retrying, failed, error: updateError.message };
    }
    if (!Array.isArray(written) || written.length === 0) {
      // Our claim expired and another worker claimed a later attempt.
      skipped++;
      continue;
    }

    if (update.enrichment_status === "succeeded") enriched++;
    else if (update.enrichment_status === "retrying") retrying++;
    else failed++;
  }

  return { enriched, skipped, retrying, failed };
}

/** Number of articles whose enrichment is unfinished and due now (for drain loops and health). */
export async function countDueEnrichmentBacklog(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<{ count: number; error?: string }> {
  const { count, error } = await supabase
    .from("news_items")
    .select("id", { count: "exact", head: true })
    .in("enrichment_status", ENRICHABLE_STATUSES)
    .or(`enrichment_next_attempt_at.is.null,enrichment_next_attempt_at.lte.${now.toISOString()}`);
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0 };
}
