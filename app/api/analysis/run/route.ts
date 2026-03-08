import { createClient } from "@/lib/supabase/server";
import { runAnalysis } from "@/lib/services/analysis";

/**
 * POST /api/analysis/run
 * Body: { portfolioId: string }
 * Starts an analysis run for the given portfolio. Returns { runId, error? }.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { portfolioId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const portfolioId = body.portfolioId;
  if (!portfolioId || typeof portfolioId !== "string") {
    return new Response(JSON.stringify({ error: "portfolioId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (!portfolio) {
    return new Response(JSON.stringify({ error: "Portfolio not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await runAnalysis(supabase, portfolioId);
  if (result.error) {
    return new Response(
      JSON.stringify({ error: result.error, runId: result.runId }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  return new Response(
    JSON.stringify({ runId: result.runId }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * GET /api/analysis/run?runId=... or ?portfolioId=...
 * Returns the latest run status for the given runId or portfolioId.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const portfolioId = searchParams.get("portfolioId");

  if (runId) {
    const { data: run, error } = await supabase
      .from("analysis_runs")
      .select("id, status, progress, started_at, completed_at, portfolio_id")
      .eq("id", runId)
      .single();

    if (error || !run) {
      return new Response(JSON.stringify({ error: "Run not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: portfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", run.portfolio_id)
      .eq("user_id", user.id)
      .single();

    if (!portfolio) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        id: run.id,
        status: run.status,
        progress: run.progress,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        portfolioId: run.portfolio_id,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  if (portfolioId) {
    const { data: portfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", portfolioId)
      .eq("user_id", user.id)
      .single();

    if (!portfolio) {
      return new Response(JSON.stringify({ error: "Portfolio not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: run, error } = await supabase
      .from("analysis_runs")
      .select("id, status, progress, started_at, completed_at")
      .eq("portfolio_id", portfolioId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!run) {
      return new Response(
        JSON.stringify({ run: null, portfolioId }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        run: {
          id: run.id,
          status: run.status,
          progress: run.progress,
          startedAt: run.started_at,
          completedAt: run.completed_at,
        },
        portfolioId,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "runId or portfolioId required" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
