import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EARNINGS_NO_NEWER_REPORT_NOTE, EARNINGS_NO_REPORT_LINK_NOTE } from "@/lib/services/earnings-reports";
import { fetchAllRows } from "@/lib/supabase/paginate";

/**
 * Job health from durable state (audit H8). A cron returning HTTP 200 says nothing about whether
 * work actually completed; these signals read what the jobs left behind.
 */

export const JOB_HEALTH_THRESHOLDS = {
  /** Ingestion runs every 20 minutes; two missed runs means the schedule is not running. */
  ingestionStaleMinutes: 60,
  /** Oldest unfinished enrichment older than this means the backlog is not draining. */
  enrichmentBacklogStaleMinutes: 120,
  /** A portfolio without a usable analysis for this long is falling behind. */
  analysisStaleHours: 6,
  /** Quotes older than this count as stale. */
  quoteStaleHours: 24,
  /** Share of stale quotes above which pricing is degraded. */
  staleQuoteShare: 0.25,
  /** Articles from the last 24h whose enrichment failed for good, above which enrichment is degraded. */
  enrichmentFailedLast24h: 10,
  /** Active earnings rows whose last refresh failed (informational notes excluded). */
  earningsFailedRows: 5,
} as const;

export type JobHealthReport = {
  status: "ok" | "degraded";
  reasons: string[];
  checkedAt: string;
  ingestion: { latestArticleAt: string | null; minutesSinceLatest: number | null };
  enrichment: { dueBacklog: number; oldestPendingAt: string | null; failedLast24h: number };
  analysis: {
    failedRunsLast24h: number;
    latestUsableRunAt: string | null;
    portfolios: number;
    /** Has news enriched after its last usable run started, and that run started over analysisStaleHours ago. */
    portfoliosBehind: number;
    /** Older than analysisStaleHours and never produced a usable run. */
    portfoliosNeverAnalyzed: number;
  };
  quotes: { holdings: number; stale: number; staleShare: number | null };
  notifications: { failedLast7d: number; uncertainLast7d: number };
  earnings: { rowsWithErrors: number };
};

type Count = { count: number | null; error: { message: string } | null };

function minutesBetween(fromIso: string | null, now: Date): number | null {
  if (!fromIso) return null;
  const ms = now.getTime() - Date.parse(fromIso);
  return Number.isFinite(ms) ? Math.round(ms / 60_000) : null;
}

type UsableRun = { portfolio_id: string; started_at: string | null; completed_at: string | null };

type AnalysisFreshness = {
  latestUsableRunAt: string | null;
  portfolios: number;
  portfoliosBehind: number;
  portfoliosNeverAnalyzed: number;
  errors: Array<{ message: string }>;
};

/**
 * Analysis freshness per portfolio (PR review): the newest run across all portfolios says nothing
 * about the others, so one recently analysed portfolio could hide every portfolio the scheduler
 * skipped. "Behind" uses the analysis cron's own rule (articles enriched after the last usable
 * run started), so an up-to-date portfolio during a quiet news period is not flagged.
 */
async function loadAnalysisFreshness(supabase: SupabaseClient, now: Date): Promise<AnalysisFreshness> {
  const cutoffMs = now.getTime() - JOB_HEALTH_THRESHOLDS.analysisStaleHours * 60 * 60_000;
  const [portfolios, runs, newestEnriched] = await Promise.all([
    fetchAllRows<{ id: string; created_at: string | null }>((from, to) =>
      supabase.from("portfolios").select("id, created_at").order("id", { ascending: true }).range(from, to),
    ),
    // Only the newest few runs per portfolio are kept, so this stays small.
    fetchAllRows<UsableRun & { id: string }>((from, to) =>
      supabase
        .from("analysis_runs")
        .select("id, portfolio_id, started_at, completed_at")
        .in("status", ["complete", "degraded"])
        .order("id", { ascending: true })
        .range(from, to),
    ),
    supabase
      .from("news_items")
      .select("enriched_at")
      .eq("enrichment_status", "succeeded")
      .not("enriched_at", "is", null)
      .order("enriched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latestByPortfolio = new Map<string, UsableRun>();
  let latestUsableRunAt: string | null = null;
  for (const run of runs.data) {
    const completedMs = Date.parse(run.completed_at ?? "");
    if (!Number.isFinite(completedMs)) continue;
    const current = latestByPortfolio.get(run.portfolio_id);
    if (!current || completedMs > Date.parse(current.completed_at ?? "")) latestByPortfolio.set(run.portfolio_id, run);
    if (latestUsableRunAt === null || completedMs > Date.parse(latestUsableRunAt)) latestUsableRunAt = run.completed_at;
  }

  const newestEnrichedMs = Date.parse(
    (newestEnriched.data as { enriched_at?: string } | null)?.enriched_at ?? "",
  );
  let portfoliosBehind = 0;
  let portfoliosNeverAnalyzed = 0;
  for (const portfolio of portfolios.data) {
    const latest = latestByPortfolio.get(portfolio.id);
    if (!latest) {
      // A brand-new portfolio gets one threshold period for its first run.
      if (Date.parse(portfolio.created_at ?? "") < cutoffMs) portfoliosNeverAnalyzed += 1;
      continue;
    }
    const coveredUntilMs = Date.parse(latest.started_at ?? latest.completed_at ?? "");
    if (coveredUntilMs < cutoffMs && newestEnrichedMs > coveredUntilMs) portfoliosBehind += 1;
  }

  return {
    latestUsableRunAt,
    portfolios: portfolios.data.length,
    portfoliosBehind,
    portfoliosNeverAnalyzed,
    errors: [portfolios.error, runs.error, newestEnriched.error].filter(
      (error): error is { message: string } => Boolean(error),
    ),
  };
}

export async function loadJobHealth(supabase: SupabaseClient, now: Date = new Date()): Promise<JobHealthReport> {
  const nowIso = now.toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
  const quoteCutoff = new Date(now.getTime() - JOB_HEALTH_THRESHOLDS.quoteStaleHours * 60 * 60_000).toISOString();
  const head = { count: "exact" as const, head: true };

  const [
    latestArticle,
    dueBacklog,
    oldestPending,
    failedEnrichment,
    failedRuns,
    analysisFreshness,
    holdingsTotal,
    staleQuotes,
    failedDeliveries,
    uncertainDeliveries,
    earningsErrors,
  ] = await Promise.all([
    supabase.from("news_items").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("news_items")
      .select("id", head)
      .in("enrichment_status", ["pending", "retrying"])
      .or(`enrichment_next_attempt_at.is.null,enrichment_next_attempt_at.lte.${nowIso}`) as unknown as Promise<Count>,
    supabase
      .from("news_items")
      .select("created_at")
      .in("enrichment_status", ["pending", "retrying"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    // Windowed so health recovers once failures stop; the news pool is 24h anyway.
    supabase
      .from("news_items")
      .select("id", head)
      .eq("enrichment_status", "failed")
      .gte("created_at", dayAgo) as unknown as Promise<Count>,
    supabase.from("analysis_runs").select("id", head).eq("status", "failed").gte("created_at", dayAgo) as unknown as Promise<Count>,
    loadAnalysisFreshness(supabase, now),
    supabase.from("holdings").select("id", head) as unknown as Promise<Count>,
    supabase
      .from("holdings")
      .select("id", head)
      .or(`quote_as_of.is.null,quote_as_of.lt.${quoteCutoff}`) as unknown as Promise<Count>,
    supabase.from("notification_deliveries").select("id", head).eq("status", "failed").gte("updated_at", weekAgo) as unknown as Promise<Count>,
    supabase.from("notification_deliveries").select("id", head).eq("status", "uncertain").gte("updated_at", weekAgo) as unknown as Promise<Count>,
    supabase
      .from("ticker_earnings_reports")
      .select("symbol", head)
      .eq("is_active", true)
      .not("error", "is", null)
      .not("error", "in", `("${EARNINGS_NO_NEWER_REPORT_NOTE}","${EARNINGS_NO_REPORT_LINK_NOTE}")`) as unknown as Promise<Count>,
  ]);

  const queryErrors = [
    latestArticle.error,
    dueBacklog.error,
    oldestPending.error,
    failedEnrichment.error,
    failedRuns.error,
    ...analysisFreshness.errors,
    holdingsTotal.error,
    staleQuotes.error,
    failedDeliveries.error,
    uncertainDeliveries.error,
    earningsErrors.error,
  ].filter((error): error is { message: string } => Boolean(error));

  const latestArticleAt = (latestArticle.data as { created_at?: string } | null)?.created_at ?? null;
  const oldestPendingAt = (oldestPending.data as { created_at?: string } | null)?.created_at ?? null;
  const holdings = holdingsTotal.count ?? 0;
  const stale = staleQuotes.count ?? 0;

  const report: JobHealthReport = {
    status: "ok",
    reasons: [],
    checkedAt: nowIso,
    ingestion: { latestArticleAt, minutesSinceLatest: minutesBetween(latestArticleAt, now) },
    enrichment: { dueBacklog: dueBacklog.count ?? 0, oldestPendingAt, failedLast24h: failedEnrichment.count ?? 0 },
    analysis: {
      failedRunsLast24h: failedRuns.count ?? 0,
      latestUsableRunAt: analysisFreshness.latestUsableRunAt,
      portfolios: analysisFreshness.portfolios,
      portfoliosBehind: analysisFreshness.portfoliosBehind,
      portfoliosNeverAnalyzed: analysisFreshness.portfoliosNeverAnalyzed,
    },
    quotes: { holdings, stale, staleShare: holdings > 0 ? stale / holdings : null },
    notifications: { failedLast7d: failedDeliveries.count ?? 0, uncertainLast7d: uncertainDeliveries.count ?? 0 },
    earnings: { rowsWithErrors: earningsErrors.count ?? 0 },
  };

  const reasons = report.reasons;
  for (const error of queryErrors) reasons.push(`Health query failed: ${error.message}`);
  if (report.ingestion.minutesSinceLatest === null || report.ingestion.minutesSinceLatest > JOB_HEALTH_THRESHOLDS.ingestionStaleMinutes) {
    reasons.push("No new articles recently: the ingestion schedule may not be running.");
  }
  const backlogAge = minutesBetween(oldestPendingAt, now);
  if (backlogAge !== null && backlogAge > JOB_HEALTH_THRESHOLDS.enrichmentBacklogStaleMinutes) {
    reasons.push(`Enrichment backlog is not draining (oldest unfinished article ${backlogAge} minutes old).`);
  }
  // Review R12: terminal failures leave the backlog, so they need their own signal.
  if (report.enrichment.failedLast24h > JOB_HEALTH_THRESHOLDS.enrichmentFailedLast24h) {
    reasons.push(`${report.enrichment.failedLast24h} article(s) from the last 24 hours failed enrichment for good.`);
  }
  if (report.earnings.rowsWithErrors > JOB_HEALTH_THRESHOLDS.earningsFailedRows) {
    reasons.push(`${report.earnings.rowsWithErrors} tracked symbol(s) failed their last earnings report refresh.`);
  }
  if (report.analysis.portfoliosBehind > 0) {
    reasons.push(
      `${report.analysis.portfoliosBehind} of ${report.analysis.portfolios} portfolio(s) have unanalysed news and no usable analysis in the last ${JOB_HEALTH_THRESHOLDS.analysisStaleHours}h.`,
    );
  }
  if (report.analysis.portfoliosNeverAnalyzed > 0) {
    reasons.push(
      `${report.analysis.portfoliosNeverAnalyzed} of ${report.analysis.portfolios} portfolio(s) have never completed an analysis run.`,
    );
  }
  if (report.analysis.failedRunsLast24h > 0) {
    reasons.push(`${report.analysis.failedRunsLast24h} analysis run(s) failed in the last 24 hours.`);
  }
  if (report.quotes.staleShare !== null && report.quotes.staleShare > JOB_HEALTH_THRESHOLDS.staleQuoteShare) {
    reasons.push(`${Math.round(report.quotes.staleShare * 100)}% of holdings have quotes older than ${JOB_HEALTH_THRESHOLDS.quoteStaleHours}h.`);
  }
  if (report.notifications.failedLast7d + report.notifications.uncertainLast7d > 0) {
    reasons.push(
      `Digest deliveries need attention: ${report.notifications.failedLast7d} failed, ${report.notifications.uncertainLast7d} uncertain (last 7 days).`,
    );
  }
  report.status = reasons.length > 0 ? "degraded" : "ok";
  return report;
}
