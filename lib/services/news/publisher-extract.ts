import type { SupabaseClient } from "@supabase/supabase-js";
import { spawnArticleExtractionWorker } from "@/lib/services/news/extraction-trigger";
import { validatePublisherUrl } from "@/lib/security/publisher-url";

const EXTRACTABLE_SOURCE_TYPES = ["finnhub", "newsapi", "gnews", "marketaux"] as const;

export interface BatchExtractionStats {
  attempted: number;
  extracted: number;
  skipped: number;
  failed: number;
  skippedMissingUrl: number;
  skippedUnsupportedSource: number;
  skippedAlreadyExtracted: number;
  skippedUnsupportedUrl: number;
  errors: string[];
  queued: number;
  background: boolean;
  processedArticleIds: string[];
}

function emptyStats(): BatchExtractionStats {
  return {
    attempted: 0,
    extracted: 0,
    skipped: 0,
    failed: 0,
    skippedMissingUrl: 0,
    skippedUnsupportedSource: 0,
    skippedAlreadyExtracted: 0,
    skippedUnsupportedUrl: 0,
    errors: [],
    queued: 0,
    background: true,
    processedArticleIds: [],
  };
}

const SEC_URL_PREFIXES = ["https://www.sec.gov/", "https://sec.gov/", "https://efts.sec.gov/"];
function isUnsupportedUrl(url: string): boolean {
  return SEC_URL_PREFIXES.some((p) => url.startsWith(p)) || !validatePublisherUrl(url).ok;
}

/**
 * Mark articles for extraction and spawn the Python newspaper4k worker.
 *
 * When `articleIds` is provided the function only considers those rows,
 * classifying each one into a specific skip bucket so the caller can
 * report exactly why extraction was or was not queued.
 *
 * Does not block on network scraping — returns immediately after spawning.
 */
export async function extractPublisherContent(
  supabase: SupabaseClient,
  options?: {
    articleIds?: string[];
    limit?: number;
  },
): Promise<BatchExtractionStats> {
  const stats = emptyStats();
  const hasExplicitIds = !!options?.articleIds?.length;

  if (hasExplicitIds) {
    const { data: rows, error: fetchError } = await supabase
      .from("news_items")
      .select("id, url, source_type, extracted_content, extraction_status")
      .in("id", options!.articleIds!);

    if (fetchError) {
      stats.errors.push(fetchError.message);
      return stats;
    }
    if (!rows?.length) return stats;

    const toQueue: string[] = [];
    const unsupportedUrlIds: string[] = [];
    for (const row of rows) {
      const id = row.id as string;
      const url = (row.url as string | null)?.trim() ?? "";
      const sourceType = row.source_type as string;
      const extractedContent = row.extracted_content as string | null;
      const status = row.extraction_status as string | null;

      if (status === "complete" || (extractedContent ?? "").trim()) {
        stats.skippedAlreadyExtracted += 1;
        stats.skipped += 1;
        continue;
      }
      if (!url) {
        stats.skippedMissingUrl += 1;
        stats.skipped += 1;
        continue;
      }
      if (!(EXTRACTABLE_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
        stats.skippedUnsupportedSource += 1;
        stats.skipped += 1;
        continue;
      }
      if (isUnsupportedUrl(url)) {
        stats.skippedUnsupportedUrl += 1;
        stats.skipped += 1;
        unsupportedUrlIds.push(id);
        continue;
      }

      toQueue.push(id);
    }

    if (unsupportedUrlIds.length > 0) {
      await supabase
        .from("news_items")
        .update({
          extraction_status: "skipped",
          extraction_error: "Unsupported publisher URL",
        })
        .in("id", unsupportedUrlIds);
    }

    if (!toQueue.length) return stats;

    const { error: updateError } = await supabase
      .from("news_items")
      .update({ extraction_status: "queued" })
      .in("id", toQueue);

    if (updateError) {
      stats.errors.push(updateError.message);
      stats.failed = toQueue.length;
      return stats;
    }

    stats.queued = toQueue.length;
    stats.attempted = toQueue.length;
    stats.processedArticleIds = toQueue;
    spawnArticleExtractionWorker(toQueue);
    return stats;
  }

  const { data: articles, error: fetchError } = await supabase
    .from("news_items")
    .select("id, url, source_type, extracted_content, extraction_status")
    .is("extracted_content", null)
    .not("url", "is", null)
    .in("source_type", [...EXTRACTABLE_SOURCE_TYPES])
    .order("published_at", { ascending: false })
    .limit(options?.limit ?? 30);

  if (fetchError) {
    stats.errors.push(fetchError.message);
    return stats;
  }

  if (!articles?.length) return stats;

  const unsupportedUrlIds: string[] = [];
  const ids = articles
    .filter((a) => {
      const st = a.extraction_status as string | null;
      if (st === "complete" || st === "skipped") {
        stats.skippedAlreadyExtracted += 1;
        stats.skipped += 1;
        return false;
      }
      const url = (a.url as string | null)?.trim() ?? "";
      if (!url || isUnsupportedUrl(url)) {
        stats.skippedUnsupportedUrl += 1;
        stats.skipped += 1;
        unsupportedUrlIds.push(a.id as string);
        return false;
      }
      return true;
    })
    .map((a) => a.id as string);

  if (unsupportedUrlIds.length > 0) {
    await supabase
      .from("news_items")
      .update({
        extraction_status: "skipped",
        extraction_error: "Unsupported publisher URL",
      })
      .in("id", unsupportedUrlIds);
  }

  if (!ids.length) return stats;

  const { error: updateError } = await supabase
    .from("news_items")
    .update({ extraction_status: "queued" })
    .in("id", ids);

  if (updateError) {
    stats.errors.push(updateError.message);
    stats.failed = ids.length;
    return stats;
  }

  stats.queued = ids.length;
  stats.attempted = ids.length;
  stats.processedArticleIds = ids;
  spawnArticleExtractionWorker(ids);

  return stats;
}
