"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  describeOverview,
  formatSignedPercent,
  formatSignedUsd,
  type OverviewDisplay,
} from "@/lib/portfolio/value-display";
import { cn, formatCurrency } from "@/lib/utils";
import { valueHoldings, type PortfolioValuationSummary } from "@/lib/services/valuation";
import { formatAppDateTime } from "@/lib/time/format";
import type { Holding, PortfolioValueSnapshot } from "@/lib/types";

interface PortfolioPerformanceChartProps {
  totalValue: number;
  dayChange: number;
  /** Canonical valuation behind totalValue/dayChange; drives the hero figures and their as-of time. */
  valuation?: PortfolioValuationSummary;
  portfolioCreatedAt: string;
  holdings: Holding[];
  historicalSnapshots?: PortfolioValueSnapshot[];
}

function formatAsOf(timestamp: number | null): string | null {
  if (timestamp === null || !Number.isFinite(timestamp)) return null;
  // Product time zone, so server and browser renders agree (F15).
  return formatAppDateTime(new Date(timestamp).toISOString(), "") || null;
}

interface ChartPoint {
  date: number;
  label: string;
  value: number;
  detail: string;
}

interface ActualPerformanceSnapshot {
  data: ChartPoint[];
  currentValue: number;
  previousCloseValue: number;
  dayGainDollar: number;
  dayGainPercent: number;
  quotedHoldings: number;
  latestQuoteAt: number | null;
  source: "snapshots" | "holdings";
}

function latestQuoteTimestamp(holdings: Holding[]): number | null {
  let latest: number | null = null;

  for (const holding of holdings) {
    if (!holding.quoteAsOf) continue;
    const timestamp = Date.parse(holding.quoteAsOf);
    if (!Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }

  return latest;
}

function buildActualPerformanceSnapshot(
  holdings: Holding[],
  totalValue: number,
  portfolioCreatedAt: Date,
  fallbackDayChange: number,
): ActualPerformanceSnapshot {
  // Audit H9: the live fallback uses the canonical USD valuation, so latest value, cost basis and
  // previous close share one currency conversion and the same unvalued-position exclusions.
  const valuation = valueHoldings(holdings);
  const currentValue = totalValue > 0 ? totalValue : valuation.totalValue;
  const costBasis = valuation.costBasis;
  // Positions without a previous close are treated as unchanged today.
  const previousCloseValue =
    valuation.dayChangeAmount !== null ? currentValue - valuation.dayChangeAmount : 0;
  const latestQuoteAt = latestQuoteTimestamp(holdings);
  const quotedHoldings = valuation.freshCount + valuation.staleCount;
  const createdAtMs = Number.isFinite(portfolioCreatedAt.getTime())
    ? portfolioCreatedAt.getTime()
    : Date.now();
  const latestMs = latestQuoteAt ?? Date.now();
  const previousCloseMs = latestMs - 24 * 60 * 60 * 1000;
  const fallbackChange = Number.isFinite(fallbackDayChange)
    ? fallbackDayChange
    : 0;
  const fallbackDenominator = 1 + fallbackChange / 100;
  const effectivePreviousClose =
    previousCloseValue > 0
      ? previousCloseValue
      : fallbackDenominator > 0.001
        ? currentValue / fallbackDenominator
        : currentValue;
  const dayGainDollar =
    effectivePreviousClose > 0 ? currentValue - effectivePreviousClose : 0;
  const dayGainPercent =
    effectivePreviousClose > 0
      ? (dayGainDollar / effectivePreviousClose) * 100
      : fallbackDayChange;

  const data: ChartPoint[] = [];
  if (costBasis > 0) {
    data.push({
      date: createdAtMs,
      label: "Cost basis",
      value: costBasis,
      detail: "Average cost basis from saved holdings",
    });
  }
  if (effectivePreviousClose > 0) {
    data.push({
      date: previousCloseMs,
      label: "Prev close",
      value: effectivePreviousClose,
      detail: "Portfolio value implied by previous close quotes",
    });
  }
  data.push({
    date: latestMs,
    label: "Latest",
    value: currentValue,
    detail: latestQuoteAt
      ? "Latest synced portfolio value"
      : "Current saved portfolio value",
  });

  if (data.length === 1) {
    data.unshift({
      date: createdAtMs,
      label: "Start",
      value: currentValue,
      detail: "No cost basis or previous close available yet",
    });
  }

  return {
    data,
    currentValue,
    previousCloseValue: effectivePreviousClose,
    dayGainDollar,
    dayGainPercent,
    quotedHoldings,
    latestQuoteAt,
    source: "holdings",
  };
}

function buildHistoricalPerformanceSnapshot(
  snapshots: PortfolioValueSnapshot[],
  fallback: ActualPerformanceSnapshot,
): ActualPerformanceSnapshot {
  const validSnapshots = snapshots
    .map((snapshot) => {
      const date = Date.parse(snapshot.bucketStart || snapshot.capturedAt);
      return {
        snapshot,
        date,
      };
    })
    .filter(
      (item) =>
        Number.isFinite(item.date) &&
        Number.isFinite(item.snapshot.totalValue) &&
        item.snapshot.totalValue > 0,
    )
    .sort((a, b) => a.date - b.date);

  if (validSnapshots.length < 2) return fallback;

  const latest = validSnapshots[validSnapshots.length - 1];
  let previous = validSnapshots[validSnapshots.length - 2];
  for (let index = validSnapshots.length - 2; index >= 0; index -= 1) {
    const candidate = validSnapshots[index];
    if (latest.date - candidate.date >= 23 * 60 * 60 * 1000) {
      previous = candidate;
      break;
    }
  }
  const previousValue = previous.snapshot.totalValue;
  const currentValue = latest.snapshot.totalValue;
  const dayGainDollar = currentValue - previousValue;
  const dayGainPercent =
    previousValue > 0 ? (dayGainDollar / previousValue) * 100 : latest.snapshot.dayChangePercent;

  return {
    data: validSnapshots.map(({ snapshot, date }) => ({
      date,
      label: new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: snapshot.totalValue,
      detail: "Stored hourly portfolio value snapshot",
    })),
    currentValue,
    previousCloseValue: previousValue,
    dayGainDollar,
    dayGainPercent,
    quotedHoldings: latest.snapshot.positionsCount,
    latestQuoteAt: Date.parse(latest.snapshot.capturedAt),
    source: "snapshots",
  };
}

function formatAxisValue(value: number, range: number): string {
  if (value >= 1_000_000) {
    const inM = value / 1_000_000;
    return range < 500_000 ? `$${inM.toFixed(2)}M` : `$${inM.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const inK = value / 1_000;
    return range < 5_000 ? `$${inK.toFixed(1)}K` : `$${inK.toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function computeDomain(data: ChartPoint[]): { min: number; max: number; ticks: number[] } {
  if (data.length === 0) return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] };

  const values = data.map((d) => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || rawMax * 0.02 || 100;
  const padding = span * 0.15;

  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;

  const tickCount = 5;
  const step = (max - min) / (tickCount - 1);

  let precision: number;
  if (step >= 10_000) precision = -3;
  else if (step >= 1_000) precision = -2;
  else if (step >= 100) precision = -1;
  else precision = 0;

  const factor = Math.pow(10, -precision);
  const niceStep = Math.ceil(step / factor) * factor;

  const niceMin = Math.floor(min / factor) * factor;
  const ticks: number[] = [];
  for (let i = 0; i < tickCount; i++) {
    ticks.push(niceMin + niceStep * i);
  }

  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  const d = new Date(point.date);
  const dateStr = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="rounded-xl border border-white/10 bg-surface-raised px-4 py-3 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {point.label}
      </p>
      <p className="text-xs text-slate-500">
        {dateStr} &middot; {timeStr}
      </p>
      <p className="mt-1 text-lg font-bold text-white">
        {formatCurrency(point.value)}
      </p>
      <p className="mt-1 max-w-[220px] text-xs text-slate-500">
        {point.detail}
      </p>
    </div>
  );
}

function formatQuoteDescription(snapshot: ActualPerformanceSnapshot): string {
  if (snapshot.source === "snapshots") {
    const latest = snapshot.latestQuoteAt
      ? new Date(snapshot.latestQuoteAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "recently";
    return `Hourly stored portfolio value history. Latest snapshot ${latest}.`;
  }

  if (!snapshot.latestQuoteAt) {
    return "Cost basis, previous close, and latest saved value from your holdings.";
  }

  const latest = new Date(snapshot.latestQuoteAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const noun = snapshot.quotedHoldings === 1 ? "holding" : "holdings";
  return `Cost basis, previous close, and latest quote value from ${snapshot.quotedHoldings} ${noun}. Latest quote ${latest}.`;
}

export function PortfolioPerformanceChart({
  totalValue,
  dayChange,
  valuation,
  portfolioCreatedAt,
  holdings,
  historicalSnapshots = [],
}: PortfolioPerformanceChartProps) {
  const createdAt = useMemo(
    () => new Date(portfolioCreatedAt),
    [portfolioCreatedAt],
  );
  // "Today" always comes from the same live valuation as the total (audit F10); stored
  // snapshots only drive the history chart and its separately labelled "since" change.
  const live = useMemo(
    () => buildActualPerformanceSnapshot(holdings, totalValue, createdAt, dayChange),
    [holdings, totalValue, createdAt, dayChange],
  );
  const snapshot = useMemo(
    () => buildHistoricalPerformanceSnapshot(historicalSnapshots, live),
    [historicalSnapshots, live],
  );
  const liveAsOfMs = valuation?.newestQuoteAsOf
    ? Date.parse(valuation.newestQuoteAsOf)
    : live.latestQuoteAt;
  // Stored snapshots are only written for fully valued portfolios, so the live total is comparable
  // with them only when it covers every position too (review R5): an unavailable total (0) or a
  // partial subtotal would otherwise plot or report a fictitious loss.
  const liveStatus = useMemo(
    () => valuation?.status ?? valueHoldings(holdings).status,
    [valuation, holdings],
  );
  const liveComparable = liveStatus === "complete" && totalValue > 0;
  const data = useMemo(() => {
    if (snapshot.source !== "snapshots") return snapshot.data;
    const lastPoint = snapshot.data[snapshot.data.length - 1];
    if (!liveAsOfMs || !lastPoint || liveAsOfMs <= lastPoint.date || !liveComparable) {
      return snapshot.data;
    }
    return [
      ...snapshot.data,
      { date: liveAsOfMs, label: "Now", value: totalValue, detail: "Current value from the latest quotes" },
    ];
  }, [snapshot, liveAsOfMs, totalValue, liveComparable]);

  const hero: OverviewDisplay = valuation
    ? describeOverview({ totalValue, dayChange, valuation })
    : {
        value: formatCurrency(totalValue),
        dayChangePercent: formatSignedPercent(live.dayGainPercent),
        dayChangeAmount: live.previousCloseValue > 0 ? formatSignedUsd(live.dayGainDollar) : null,
        direction: live.dayGainDollar > 0 ? "up" : live.dayGainDollar < 0 ? "down" : "flat",
        notes: [],
        asOf: null,
      };
  const heroAsOf = formatAsOf(liveAsOfMs ?? null);
  const historyStart = snapshot.source === "snapshots" ? (snapshot.data[0]?.date ?? null) : null;
  const historyChange =
    snapshot.source === "snapshots" && snapshot.data.length >= 2 && liveComparable
      ? totalValue - snapshot.data[0].value
      : null;

  const { min: domainMin, max: domainMax, ticks } = useMemo(
    () => computeDomain(data),
    [data],
  );

  const axisRange = domainMax - domainMin;

  const isPositive = hero.direction !== "down";

  const gradientId = "performanceGradient";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Total Portfolio Value
          </p>
          <p className="mt-2 text-[34px] font-bold leading-none tracking-tight text-white sm:text-[42px]">
            {hero.value}
          </p>
          {heroAsOf ? <p className="mt-2 text-xs text-slate-500">{`As of ${heroAsOf}`}</p> : null}
          {hero.notes.map((note) => (
            <p key={note} className="mt-1 text-xs text-amber-300">
              {note}
            </p>
          ))}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-5">
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2",
              isPositive
                ? "border-brand/25 bg-brand/10 text-brand"
                : "border-red-500/25 bg-red-500/10 text-red-400",
            )}
          >
            <TrendingUp
              aria-hidden="true"
              className={cn("h-4 w-4", !isPositive && "rotate-180")}
            />
            <span className="text-sm font-bold">
              {hero.direction === "unknown" ? "Day change unavailable" : `${hero.dayChangePercent} today`}
            </span>
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Day change
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-bold tracking-tight",
                hero.direction === "down"
                  ? "text-red-400"
                  : hero.direction === "up"
                    ? "text-brand"
                    : "text-slate-400",
              )}
            >
              {hero.dayChangeAmount ?? "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold uppercase tracking-[0.15em] text-white">
                Portfolio Performance
              </p>
              <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand">
                {snapshot.source === "snapshots" ? "Hourly snapshots" : "Live quotes"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {formatQuoteDescription(snapshot)}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <span className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-bold text-slate-400">
              {snapshot.source === "snapshots" ? "Stored hourly values" : "Actual holdings"}
            </span>
            {historyChange !== null && historyStart !== null ? (
              <span className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-bold text-slate-400">
                {`Since ${new Date(historyStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${formatSignedUsd(historyChange)}`}
              </span>
            ) : live.previousCloseValue > 0 ? (
              <span className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-bold text-slate-400">
                Prev close {formatCurrency(Math.round(live.previousCloseValue))}
              </span>
            ) : null}
          </div>
        </div>

        <div className="h-[260px] w-full sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="60%" stopColor="#10b981" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="none"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />

              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#475569", fontSize: 11, fontWeight: 500 }}
                dy={10}
                interval="equidistantPreserveStart"
              />

              <YAxis
                orientation="right"
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatAxisValue(v, axisRange)}
                tick={{ fill: "#475569", fontSize: 11, fontWeight: 500 }}
                dx={8}
                width={72}
                domain={[domainMin, domainMax]}
                ticks={ticks}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: "rgba(255,255,255,0.1)",
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />

              <Area
                type="monotone"
                dataKey="value"
                stroke="#10b981"
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                animationDuration={800}
                animationEasing="ease-out"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: "#10b981",
                  stroke: "#0a0f15",
                  strokeWidth: 2.5,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
