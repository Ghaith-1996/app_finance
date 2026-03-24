import { createServiceClient } from "@/lib/supabase/service";
import { runAnalysis } from "@/lib/services/analysis";
import { createLogger } from "@/lib/logger";

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

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return { errorResponse: json({ error: "Unauthorized" }, 401) };
  }

  return { errorResponse: null };
}

async function getPortfolios(supabase: ReturnType<typeof createServiceClient>) {
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, user_id");

  return (portfolios ?? []) as PortfolioRow[];
}

async function getLatestCompletedRun(
  supabase: ReturnType<typeof createServiceClient>,
  portfolioId: string,
) {
  const { data: latestRun } = await supabase
    .from("analysis_runs")
    .select("completed_at")
    .eq("portfolio_id", portfolioId)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return latestRun as { completed_at?: string | null } | null;
}

async function getEligiblePortfolioIds(
  supabase: ReturnType<typeof createServiceClient>,
) {
  const portfolios = await getPortfolios(supabase);
  const portfolioIds: string[] = [];
  let skippedCount = 0;

  for (const portfolio of portfolios) {
    const latestRun = await getLatestCompletedRun(supabase, portfolio.id);
    if (isInCooldown(latestRun?.completed_at)) {
      skippedCount++;
      continue;
    }
    portfolioIds.push(portfolio.id);
  }

  return { portfolioIds, skippedCount };
}

async function runListEligiblePortfolios(request: Request) {
  const auth = await authorizeCron(request);
  if (auth.errorResponse) return auth.errorResponse;

  const supabase = createServiceClient();
  const { portfolioIds, skippedCount } = await getEligiblePortfolioIds(supabase);

  log.info("Analysis cron eligible portfolios computed", {
    eligible: portfolioIds.length,
    skippedCount,
  });

  return json({
    portfolioIds,
    skippedCount,
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

  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).portfolioId !== "string") {
    return json({ error: "portfolioId required" }, 400);
  }

  const portfolioId = String((body as { portfolioId: string }).portfolioId).trim();
  if (!portfolioId) {
    return json({ error: "portfolioId required" }, 400);
  }

  const supabase = createServiceClient();
  const portfolios = await getPortfolios(supabase);
  const portfolio = portfolios.find((row) => row.id === portfolioId);

  if (!portfolio) {
    return json({ error: "Portfolio not found" }, 404);
  }

  const latestRun = await getLatestCompletedRun(supabase, portfolioId);
  if (isInCooldown(latestRun?.completed_at)) {
    log.info("Analysis cron skipped portfolio in cooldown", { portfolioId });
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
    const responseBody = {
      portfolioId,
      skipped: false,
      runId: result.runId,
      error: result.error,
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
