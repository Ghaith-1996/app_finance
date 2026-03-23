import type { SupabaseClient } from "@supabase/supabase-js";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const EXTRACTABLE_SOURCE_TYPES = ["finnhub", "newsapi", "gnews", "marketaux"] as const;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_STORED_CHARS = 50_000;

const SKIP_EXTENSIONS = [".pdf", ".xml", ".json", ".csv", ".zip", ".gz"];

type ExtractionStatus = "ok" | "skipped" | "fetch_error" | "parse_error" | "empty";

interface ExtractionMeta {
  status: ExtractionStatus;
  extractedTitle?: string;
  canonicalUrl?: string;
  error?: string;
  extractedAt: string;
  charCount?: number;
}

export interface ExtractionResult {
  fullText: string | null;
  meta: ExtractionMeta;
}

export interface BatchExtractionStats {
  attempted: number;
  extracted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

function shouldSkipUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return SKIP_EXTENSIONS.some((ext) => path.endsWith(ext));
  } catch {
    return true;
  }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("xml")) {
      throw new Error(`Non-HTML content-type: ${contentType.split(";")[0]}`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_HTML_BYTES) {
      throw new Error(`Response too large: ${buffer.byteLength} bytes`);
    }

    const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    return { html, finalUrl: response.url };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractArticle(html: string, url: string): ExtractionResult {
  const now = new Date().toISOString();

  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    const reader = new Readability(doc);
    const parsed = reader.parse();

    if (!parsed || !parsed.textContent?.trim()) {
      return {
        fullText: null,
        meta: { status: "empty", extractedAt: now, error: "Readability returned no content" },
      };
    }

    const fullText = normalizeWhitespace(parsed.textContent).slice(0, MAX_STORED_CHARS);

    const canonical =
      doc.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ??
      doc.querySelector<HTMLMetaElement>("meta[property='og:url']")?.content;

    return {
      fullText,
      meta: {
        status: "ok",
        extractedTitle: parsed.title || undefined,
        canonicalUrl: canonical || undefined,
        extractedAt: now,
        charCount: fullText.length,
      },
    };
  } catch (error) {
    return {
      fullText: null,
      meta: {
        status: "parse_error",
        extractedAt: now,
        error: error instanceof Error ? error.message : "Unknown parse error",
      },
    };
  }
}

export async function extractFromUrl(url: string): Promise<ExtractionResult> {
  const now = new Date().toISOString();

  if (!url || shouldSkipUrl(url)) {
    return {
      fullText: null,
      meta: { status: "skipped", extractedAt: now, error: "Unsupported URL format" },
    };
  }

  try {
    const { html, finalUrl } = await fetchHtml(url);
    return extractArticle(html, finalUrl);
  } catch (error) {
    return {
      fullText: null,
      meta: {
        status: "fetch_error",
        extractedAt: now,
        error: error instanceof Error ? error.message : "Unknown fetch error",
      },
    };
  }
}

/**
 * Run publisher-page extraction for recently inserted URL-based articles
 * that don't yet have extracted content.
 *
 * Designed to be called between raw insert and AI enrichment in the
 * ingest pipeline. Failures are recorded per-article and never block
 * the overall pipeline.
 */
export async function extractPublisherContent(
  supabase: SupabaseClient,
  options?: {
    /** Only process these article IDs (from newly inserted batch). */
    articleIds?: string[];
    /** Max articles to process in one call (default 30). */
    limit?: number;
  },
): Promise<BatchExtractionStats> {
  const stats: BatchExtractionStats = {
    attempted: 0,
    extracted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  let query = supabase
    .from("news_items")
    .select("id, url, source_type, metadata")
    .is("extracted_content", null)
    .not("url", "is", null)
    .in("source_type", [...EXTRACTABLE_SOURCE_TYPES])
    .order("published_at", { ascending: false })
    .limit(options?.limit ?? 30);

  if (options?.articleIds?.length) {
    query = query.in("id", options.articleIds);
  }

  const { data: articles, error: fetchError } = await query;

  if (fetchError) {
    stats.errors.push(fetchError.message);
    return stats;
  }

  if (!articles?.length) return stats;

  for (const article of articles) {
    const url = article.url as string | null;
    if (!url) {
      stats.skipped += 1;
      continue;
    }

    const existingMeta = (article.metadata as Record<string, unknown>) ?? {};
    const priorExtraction = existingMeta.publisher_extraction as
      | Record<string, unknown>
      | undefined;
    if (priorExtraction?.status === "ok") {
      stats.skipped += 1;
      continue;
    }

    stats.attempted += 1;

    const result = await extractFromUrl(url);

    const updatedMeta = {
      ...existingMeta,
      publisher_extraction: result.meta,
    };

    const updatePayload: Record<string, unknown> = { metadata: updatedMeta };
    if (result.fullText) {
      updatePayload.extracted_content = result.fullText;
    }

    const { error: updateError } = await supabase
      .from("news_items")
      .update(updatePayload)
      .eq("id", article.id as string);

    if (updateError) {
      stats.failed += 1;
      stats.errors.push(updateError.message);
      continue;
    }

    if (result.fullText) {
      stats.extracted += 1;
    } else {
      stats.failed += 1;
      if (result.meta.error) {
        stats.errors.push(`${(article.id as string).slice(0, 8)}: ${result.meta.error}`);
      }
    }
  }

  return stats;
}
