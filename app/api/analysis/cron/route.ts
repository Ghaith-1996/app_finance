import { createServiceClient } from "@/lib/supabase/service";
import { runAnalysis } from "@/lib/services/analysis";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron-analysis");

const ANALYSIS_COOLDOWN_MS = 15 * 60 * 1000;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function runAnalysisCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: "CRON_SECRET not configured" }, 500);
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createServiceClient();

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, user_id");

  const analysisResults: Array<{
    portfolioId: string;
    runId: string | null;
    feedItemsCreated: number;
    error: string | null;
    skipped?: boolean;
  }> = [];

  for (const portfolio of portfolios ?? []) {
    try {
      const { data: latestRun } = await supabase
        .from("analysis_runs")
        .select("completed_at")
        .eq("portfolio_id", portfolio.id)
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRun?.completed_at) {
        const elapsed = Date.now() - new Date(latestRun.completed_at).getTime();
        if (elapsed < ANALYSIS_COOLDOWN_MS) {
          analysisResults.push({
            portfolioId: portfolio.id,
            runId: null,
            feedItemsCreated: 0,
            error: null,
            skipped: true,
          });
          continue;
        }
      }

      const result = await runAnalysis(supabase, portfolio.id);
      analysisResults.push({
        portfolioId: portfolio.id,
        runId: result.runId,
        feedItemsCreated: result.meta?.feedItemsCreated ?? 0,
        error: result.error,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Analysis failed for portfolio", {
        portfolioId: portfolio.id,
        error: message,
      });
      analysisResults.push({
        portfolioId: portfolio.id,
        runId: null,
        feedItemsCreated: 0,
        error: message,
      });
    }
  }

  const portfoliosProcessed = analysisResults.filter((r) => !r.skipped && !r.error).length;
  const portfoliosSkipped = analysisResults.filter((r) => r.skipped).length;
  const errors = analysisResults
    .filter((r) => r.error)
    .map((r) => ({ portfolioId: r.portfolioId, error: r.error }));

  log.info("Analysis cron completed", {
    portfoliosProcessed,
    portfoliosSkipped,
    errors: errors.length,
  });

  return json({
    portfoliosProcessed,
    portfoliosSkipped,
    errors,
    results: analysisResults,
  });
}

export async function POST(request: Request) {
  return runAnalysisCron(request);
}
