import { cache } from "react";

import {
  getPortfolio,
  getPortfolioOverview,
  syncHoldingPricesIfStale,
} from "@/lib/actions/portfolio";

const inFlightOverviewLoads = new Map<
  string,
  Promise<Awaited<ReturnType<typeof getPortfolioOverview>>>
>();

const inFlightFullLoads = new Map<
  string,
  Promise<{
    portfolioResult: Awaited<ReturnType<typeof getPortfolio>>;
    overviewResult: Awaited<ReturnType<typeof getPortfolioOverview>>;
  }>
>();

export const loadFreshOverviewAfterPriceSync = cache(async (portfolioId: string) => {
  const inFlight = inFlightOverviewLoads.get(portfolioId);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    try {
      await syncHoldingPricesIfStale(portfolioId);
      return await getPortfolioOverview(portfolioId);
    } finally {
      inFlightOverviewLoads.delete(portfolioId);
    }
  })();

  inFlightOverviewLoads.set(portfolioId, promise);
  return promise;
});

export const loadFreshFullPortfolioAfterPriceSync = cache(async (portfolioId: string) => {
  const inFlight = inFlightFullLoads.get(portfolioId);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    try {
      await syncHoldingPricesIfStale(portfolioId);

      const [portfolioResult, overviewResult] = await Promise.all([
        getPortfolio(portfolioId),
        getPortfolioOverview(portfolioId),
      ]);

      return { portfolioResult, overviewResult };
    } finally {
      inFlightFullLoads.delete(portfolioId);
    }
  })();

  inFlightFullLoads.set(portfolioId, promise);
  return promise;
});
