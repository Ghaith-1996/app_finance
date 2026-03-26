import { NextRequest, NextResponse } from "next/server";

import {
  getPortfolioOverview,
  syncHoldingPricesIfStale,
} from "@/lib/actions/portfolio";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Missing portfolioId" }, 400);
  }

  const parsedBody =
    payload && typeof payload === "object"
      ? (payload as { portfolioId?: unknown })
      : {};
  const portfolioId =
    typeof parsedBody.portfolioId === "string" ? parsedBody.portfolioId.trim() : "";

  if (!portfolioId) {
    return json({ error: "Missing portfolioId" }, 400);
  }

  const result = await syncHoldingPricesIfStale(portfolioId, {
    minAgeMs: 5 * 60_000,
  });

  if (result.error === "Unauthorized") {
    return json(result, 401);
  }

  if (result.error === "Portfolio not found") {
    return json(result, 404);
  }

  if (result.error) {
    return json(result, 500);
  }

  const overviewResult = await getPortfolioOverview(portfolioId);

  if (overviewResult.error === "Unauthorized") {
    return json({ ...result, overview: null }, 401);
  }

  if (overviewResult.error === "Portfolio not found") {
    return json({ ...result, overview: null }, 404);
  }

  if (overviewResult.error) {
    return json({ ...result, overview: null, error: overviewResult.error }, 500);
  }

  return json({
    ...result,
    overview: overviewResult.data,
  });
}
