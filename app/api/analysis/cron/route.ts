import { createServiceClient } from "@/lib/supabase/service";
import { runAnalysis } from "@/lib/services/analysis";
import { createLogger } from "@/lib/logger";
import { fetchAllRows } from "@/lib/supabase/paginate";

const log = createLogger("cron-analysis");

const ANALYSIS_COOLDOWN_MS = 15 * 60 * 1000;

type PortfolioRow = {
  id: string;
  user_id: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function isInCooldown(completedAt: string | null | undefined) {
  if (!completedAt) return false;
  const elapsed = Date.now() - new Date(completedAt).getTime();
  return elapsed < ANALYSIS_COOLDOWN_MS;
}

async function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { errorResponse: json({ error: "CRON_SECRET not configured" }, 500) };
  }

  const auth = request.headers.get("authorization") ?? "";
  const { isTimingSafeEqual } = await import("@/lib/security/timing");
  if (!isTimingSafeEqual(auth, `Bearer ${secret}`)) {
    return { errorResponse: json({ error: "Unauthorized" }, 401) };
  }

  return { errorResponse: null };
}

async function getPortfolios(supabase: ReturnType<typeof createServiceClient>) {
  const { data: portfolios, error } = await fetchAllRows<PortfolioRow>((from, to) =>
    supabase.from("portfolios").select("id, user_id").order("id", { ascending: true }).range(from, to),
  );
  if (error) throw new Error(`Could not load portfolios: ${error.message}`);
  return portfolios;
}

// Review P1: terminal failures count as work too. They carry fallback text that runAnalysis can
// still match, and during a provider outage they may be the only articles that settle.
const SETTLED_ENRICHMENT_STATUSES = ["succeeded", "failed"];

async function getNewestEnrichedAt(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from("news_items")
    .select("enriched_at")
    .in("enrichment_status", SETTLED_ENRICHMENT_STATUSES)
    .not("enriched_at", "is", null)
    .order("enriched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read enrichment freshness: ${error.message}`);
  return (data?.enriched_at as string | null | undefined) ?? null;
}

async function getLatestCompletedRun(
  supabase: ReturnType<typeof createServiceClient>,
  portfolioId: string,
) {
  const { data: latestRun } = await supabase
    .from("analysis_runs")
    .select("completed_at, started_at")
    .eq("portfolio_id", portfolioId)
    .in("status", ["complete", "degraded"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return latestRun as { completed_at?: string | null; started_at?: string | null } | null;
}

async function getEligiblePortfolioIds(
  supabase: ReturnType<typeof createServiceClient>,
  opts?: { force?: boolean },
) {
  const portfolios = await getPortfolios(supabase);
  const newestEnrichedAt = opts?.force ? null : await getNewestEnrichedAt(supabase);
  const portfolioIds: string[] = [];
  let skippedCount = 0;
  let upToDateCount = 0;

  // Audit J1: a portfolio needs analysis when it has never produced a usable run, or when
  // articles were enriched after its last usable run — not merely when this run inserted rows.
  // A failed run leaves the last usable run older than the news, so it is retried next time.
  for (const portfolio of portfolios) {
    if (!opts?.force) {
      const latestRun = await getLatestCompletedRun(supabase, portfolio.id);
      const completedAt = latestRun?.completed_at ?? null;
      if (isInCooldown(completedAt)) {
        skippedCount++;
        continue;
      }
      // Review R7: the run read the news pool after it started, so only articles enriched before
      // its start are certainly covered. Comparing with its end would treat an article enriched
      // mid-run (after the pool was read) as already analysed.
      const coveredUntil = latestRun?.started_at ?? completedAt;
      const hasNewWork =
        !completedAt ||
        (newestEnrichedAt !== null && Date.parse(newestEnrichedAt) > Date.parse(coveredUntil!));
      if (!hasNewWork) {
        upToDateCount++;
        continue;
      }
    }
    portfolioIds.push(portfolio.id);
  }

  return { portfolioIds, skippedCount, upToDateCount };
}

async function runListEligiblePortfolios(request: Request) {
  const auth = await authorizeCron(request);
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  const supabase = createServiceClient();
  let eligibility: Awaited<ReturnType<typeof getEligiblePortfolioIds>>;
  try {
    eligibility = await getEligiblePortfolioIds(supabase, { force });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Analysis cron eligibility failed", { error: message });
    return json({ error: message }, 503);
  }
  const { portfolioIds, skippedCount, upToDateCount } = eligibility;

  log.info("Analysis cron eligible portfolios computed", {
    eligible: portfolioIds.length,
    skippedCount,
    upToDateCount,
    force,
  });

  return json({
    portfolioIds,
    skippedCount,
    upToDateCount,
  });
}

async function runAnalysisCron(request: Request) {
  const auth = await authorizeCron(request);
  if (auth.errorResponse) return auth.errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body || typeof body !== "object") {
    return json({ error: "Invalid body" }, 400);
  }

  const parsed = body as Record<string, unknown>;
  if (typeof parsed.portfolioId !== "string") {
    return json({ error: "portfolioId required" }, 400);
  }

  const portfolioId = String(parsed.portfolioId).trim();
  const force = parsed.force === true;
  if (!portfolioId) {
    return json({ error: "portfolioId required" }, 400);
  }

  const supabase = createServiceClient();
  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .maybeSingle();

  if (portfolioError) {
    return json({ error: portfolioError.message }, 503);
  }
  if (!portfolio) {
    return json({ error: "Portfolio not found" }, 404);
  }

  const latestRun = await getLatestCompletedRun(supabase, portfolioId);
  if (!force && isInCooldown(latestRun?.completed_at)) {
    log.info("Analysis cron skipped portfolio in cooldown", { portfolioId, force });
    return json({
      portfolioId,
      skipped: true,
      runId: null,
      error: null,
      meta: null,
    });
  }

  try {
    const result = await runAnalysis(supabase, portfolioId);
    if (result.code === "analysis_already_running") {
      log.info("Analysis cron skipped portfolio already in progress", {
        portfolioId,
      });
      return json({
        portfolioId,
        skipped: true,
        runId: null,
        error: null,
        code: result.code,
        meta: result.meta ?? null,
      });
    }

    const responseBody = {
      portfolioId,
      skipped: false,
      runId: result.runId,
      error: result.error,
      code: result.code ?? null,
      meta: result.meta ?? null,
    };

    log.info("Analysis cron processed portfolio", {
      portfolioId,
      runId: result.runId,
      error: result.error,
    });

    return json(responseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Analysis failed for portfolio", {
      portfolioId,
      error: message,
    });
    return json({
      portfolioId,
      skipped: false,
      runId: null,
      error: message,
      meta: null,
    });
  }
}

export async function GET(request: Request) {
  return runListEligiblePortfolios(request);
}

export async function POST(request: Request) {
  return runAnalysisCron(request);
}
