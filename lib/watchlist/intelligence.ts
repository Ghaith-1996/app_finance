import type { WatchlistDetailData } from "@/lib/services/twelvedata";

export type WatchlistSignalTone = "good" | "watch" | "risk" | "neutral";

export type WatchlistIntelligenceSignal = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: WatchlistSignalTone;
};

export type WatchlistIntelligence = {
  summary: string;
  signals: WatchlistIntelligenceSignal[];
};

function fmt(value: number | null | undefined, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}${suffix}`;
}

function fmtBig(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return value.toLocaleString();
}

export function buildWatchlistIntelligence(
  data: WatchlistDetailData,
): WatchlistIntelligence {
  const signals: WatchlistIntelligenceSignal[] = [];
  const changePercent = data.summary.changePercent;

  if (changePercent != null) {
    const absMove = Math.abs(changePercent);
    signals.push({
      id: "price-move",
      label: "Price pressure",
      value: `${changePercent > 0 ? "+" : ""}${fmt(changePercent, "%")}`,
      detail:
        absMove >= 5
          ? "Large one-day move. Check news and earnings context before acting."
          : absMove >= 2
            ? "Meaningful one-day move worth monitoring in the feed."
            : "Price move is contained compared with the active alert threshold.",
      tone: absMove >= 5 ? "risk" : absMove >= 2 ? "watch" : "neutral",
    });
  }

  const latestActual = [...data.earnings].reverse().find((item) => item.epsActual != null);
  const upcoming = data.earnings.find(
    (item) => item.epsActual == null && item.epsEstimate != null,
  );
  if (upcoming || latestActual || data.latestEarningsReportUrl) {
    signals.push({
      id: "earnings",
      label: "Earnings catalyst",
      value: upcoming ? "Upcoming" : data.latestEarningsReportUrl ? "Report linked" : "Earnings data",
      detail: data.latestEarningsReportUrl
        ? "Latest issuer or SEC earnings report is linked for deeper review."
        : "Earnings estimates are available; monitor revisions and surprise risk.",
      tone: upcoming ? "watch" : "good",
    });
  }

  if (data.profile.sector || data.profile.industry) {
    signals.push({
      id: "business-context",
      label: "Business context",
      value: data.profile.sector ?? data.profile.industry ?? "Profile",
      detail: data.profile.industry
        ? `${data.profile.industry} exposure can be compared with portfolio sector risk.`
        : "Sector metadata is available for portfolio context.",
      tone: "neutral",
    });
  }

  if (data.stats.marketCap != null) {
    signals.push({
      id: "market-cap",
      label: "Size profile",
      value: `$${fmtBig(data.stats.marketCap)}`,
      detail:
        data.stats.marketCap >= 200_000_000_000
          ? "Large-cap profile; macro and index flows may matter more."
          : "Smaller capitalization can amplify company-specific risk.",
      tone: data.stats.marketCap >= 200_000_000_000 ? "neutral" : "watch",
    });
  }

  if (data.stats.pe != null || data.stats.forwardPe != null) {
    const pe = data.stats.forwardPe ?? data.stats.pe;
    signals.push({
      id: "valuation",
      label: "Valuation read",
      value: `${fmt(pe)}x`,
      detail:
        pe != null && pe > 40
          ? "Elevated earnings multiple; thesis depends more on growth durability."
          : pe != null && pe < 15
            ? "Lower earnings multiple; check whether fundamentals explain the discount."
            : "Valuation sits in a moderate range based on available P/E data.",
      tone: pe != null && pe > 40 ? "watch" : "neutral",
    });
  }

  if (data.stats.beta != null) {
    signals.push({
      id: "beta",
      label: "Volatility",
      value: fmt(data.stats.beta),
      detail:
        data.stats.beta >= 1.5
          ? "Higher beta name; expect larger swings when markets move."
          : "Beta does not currently point to unusually high market sensitivity.",
      tone: data.stats.beta >= 1.5 ? "watch" : "neutral",
    });
  }

  const summary =
    signals.length > 0
      ? `Watch ${data.symbol} through ${signals
          .slice(0, 3)
          .map((signal) => signal.label.toLowerCase())
          .join(", ")}.`
      : `Add more market data or run refreshes to build a watch thesis for ${data.symbol}.`;

  return {
    summary,
    signals: signals.slice(0, 6),
  };
}
