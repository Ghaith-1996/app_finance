"use client";

import { useMemo, useState } from "react";
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
import { cn, formatCurrency } from "@/lib/utils";

type TimeRange = "1D" | "1W" | "1M" | "ALL";

interface PortfolioPerformanceChartProps {
  totalValue: number;
  dayChange: number;
  portfolioCreatedAt: string;
}

interface ChartPoint {
  date: number;
  label: string;
  value: number;
}

function getRangeStartDate(range: TimeRange, now: Date): Date {
  const start = new Date(now);
  switch (range) {
    case "1D":
      start.setDate(start.getDate() - 1);
      break;
    case "1W":
      start.setDate(start.getDate() - 7);
      break;
    case "1M":
      start.setMonth(start.getMonth() - 1);
      break;
    case "ALL":
      start.setFullYear(start.getFullYear() - 5);
      break;
  }
  return start;
}

function generateChartData(
  totalValue: number,
  range: TimeRange,
  createdAt: Date,
): ChartPoint[] {
  const now = new Date();
  const rangeStart = getRangeStartDate(range, now);
  const effectiveStart = createdAt > rangeStart ? createdAt : rangeStart;

  const diffMs = now.getTime() - effectiveStart.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  let points: number;
  if (range === "1D") {
    points = Math.max(2, Math.min(24, Math.ceil(diffDays * 24)));
  } else {
    points = Math.max(2, Math.min(range === "1W" ? 7 : range === "1M" ? 30 : 90, Math.ceil(diffDays)));
  }

  const volatility =
    range === "1D" ? 0.003 : range === "1W" ? 0.008 : range === "1M" ? 0.02 : 0.06;
  const trend =
    range === "1D" ? 0.001 : range === "1W" ? 0.005 : range === "1M" ? 0.03 : 0.15;

  const startValue = totalValue / (1 + trend);
  const data: ChartPoint[] = [];

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const trendComponent = startValue * trend * progress;
    const noise =
      (Math.sin(i * 1.7) * 0.4 + Math.sin(i * 0.3) * 0.6) *
      startValue *
      volatility;
    const value = startValue + trendComponent + noise;

    const pointDate = new Date(
      effectiveStart.getTime() + (diffMs * i) / (points - 1),
    );

    let label: string;
    if (range === "1D") {
      label = pointDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } else {
      label = pointDate
        .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
        .toUpperCase();
    }

    data.push({ date: pointDate.getTime(), label, value });
  }

  if (data.length > 0) {
    data[data.length - 1].value = totalValue;
  }

  return data;
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
    <div className="rounded-xl border border-white/10 bg-[#0f1419] px-4 py-3 shadow-xl">
      <p className="text-xs text-slate-500">
        {dateStr} &middot; {timeStr}
      </p>
      <p className="mt-1 text-lg font-bold text-white">
        {formatCurrency(point.value)}
      </p>
    </div>
  );
}

function getRangeDescription(range: TimeRange, createdAt: Date): string {
  const now = new Date();
  const rangeStart = getRangeStartDate(range, now);
  const effectiveStart = createdAt > rangeStart ? createdAt : rangeStart;
  const diffDays = Math.ceil(
    (now.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (range === "1D") {
    const hours = Math.min(24, Math.ceil(diffDays * 24));
    return `Simulated trend over ${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  return `Simulated trend over ${diffDays} day${diffDays !== 1 ? "s" : ""}`;
}

export function PortfolioPerformanceChart({
  totalValue,
  dayChange,
  portfolioCreatedAt,
}: PortfolioPerformanceChartProps) {
  const [range, setRange] = useState<TimeRange>("1M");
  const createdAt = useMemo(
    () => new Date(portfolioCreatedAt),
    [portfolioCreatedAt],
  );
  const data = useMemo(
    () => generateChartData(totalValue, range, createdAt),
    [totalValue, range, createdAt],
  );

  const { min: domainMin, max: domainMax, ticks } = useMemo(
    () => computeDomain(data),
    [data],
  );

  const axisRange = domainMax - domainMin;

  const dayGainDollar = totalValue * (dayChange / 100);
  const isPositive = dayChange >= 0;

  const gradientId = "performanceGradient";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Total Portfolio Value
          </p>
          <p className="mt-2 text-[34px] font-bold leading-none tracking-tight text-white sm:text-[42px]">
            {formatCurrency(totalValue)}
          </p>
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
              className={cn("h-4 w-4", !isPositive && "rotate-180")}
            />
            <span className="text-sm font-bold">
              {isPositive ? "+" : ""}
              {dayChange.toFixed(1)}% Today
            </span>
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              24H Gain
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-bold tracking-tight",
                isPositive ? "text-brand" : "text-red-400",
              )}
            >
              {isPositive ? "+" : ""}
              {formatCurrency(Math.abs(dayGainDollar))}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold uppercase tracking-[0.15em] text-white">
                Growth Performance
              </p>
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                Simulated
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {getRangeDescription(range, createdAt)}
            </p>
          </div>
          <div className="flex w-full overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.03] p-1 sm:w-auto">
            {(["1D", "1W", "1M", "ALL"] as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "min-w-[48px] shrink-0 rounded-lg px-4 py-1.5 text-xs font-bold transition",
                  range === r
                    ? "bg-brand/15 text-brand"
                    : "text-slate-500 hover:text-slate-300",
                )}
              >
                {r}
              </button>
            ))}
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
