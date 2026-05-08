"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  Globe,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getWatchlistItemDetails } from "@/lib/actions/watchlist";
import type {
  WatchlistDetailData,
  ChartPoint,
  EarningsDataPoint,
  FinancialDataPoint,
} from "@/lib/services/twelvedata";
import { sanitizeExternalUrl } from "@/lib/security/external-url";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmt(v: number | null, decimals = 2): string {
  if (v == null) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtBig(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1_000_000_000_000) return `${(v / 1_000_000_000_000).toFixed(2)}T`;
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

function fmtVol(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function toTooltipNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatPriceTooltip(value: unknown): [string, string] {
  const numericValue = toTooltipNumber(value);
  return [numericValue == null ? "â€”" : `$${numericValue.toFixed(2)}`, "Price"];
}

function formatFinancialTooltip(value: unknown): [string, undefined] {
  const numericValue = toTooltipNumber(value);
  return [numericValue == null ? "â€”" : `$${fmtBig(numericValue)}`, undefined];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  symbol: string;
}

type TabKey = "overview" | "financials";

export function WatchlistDetailDashboard({ symbol }: Props) {
  const [data, setData] = useState<WatchlistDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setTab("overview");

    getWatchlistItemDetails(symbol)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            symbol,
            summary: { company: "", exchange: "", currency: "USD", price: null, change: null, changePercent: null, isMarketOpen: null },
            chart: [],
            stats: { open: null, high: null, low: null, previousClose: null, volume: null, averageVolume: null, marketCap: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, beta: null, pe: null, forwardPe: null, eps: null, dividendYield: null, profitMargin: null, revenueGrowth: null },
            profile: { sector: null, industry: null, country: null, website: null, description: null, ceo: null, employees: null },
            earnings: [],
            financials: [],
            capabilities: { hasStats: false, hasProfile: false, hasEarnings: false, hasFinancials: false },
            warnings: [],
            error: "Failed to load details. Try again later.",
            latestEarningsReportUrl: null,
            latestEarningsReportSource: null,
            latestEarningsReportDate: null,
          });
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!data || data.error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-300">{data?.error ?? "Failed to load details."}</p>
      </div>
    );
  }

  const up = (data.summary.changePercent ?? 0) >= 0;

  return (
    <div className="space-y-4">
      <HeroRow data={data} up={up} />

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
        {(["overview", "financials"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest transition",
              tab === t
                ? "bg-brand/15 text-brand"
                : "text-slate-500 hover:text-slate-300",
            )}
          >
            {t === "overview" ? "Overview" : "Financials"}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <OverviewTab data={data} up={up} />
      ) : (
        <FinancialsTab data={data} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-28 rounded-2xl bg-white/[0.04]" />
      <div className="h-10 rounded-xl bg-white/[0.04]" />
      <div className="h-48 rounded-2xl bg-white/[0.04]" />
      <div className="h-36 rounded-2xl bg-white/[0.04]" />
      <div className="h-24 rounded-2xl bg-white/[0.04]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroRow({ data, up }: { data: WatchlistDetailData; up: boolean }) {
  const { summary } = data;
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight text-white">{data.symbol}</h2>
          <p className="mt-0.5 truncate text-[13px] text-slate-500">
            {summary.company}
            {summary.exchange ? ` · ${summary.exchange}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {summary.price != null ? (
            <p className="text-xl font-bold text-white">
              ${fmt(summary.price)}
              <span className="ml-1 text-[10px] font-medium text-slate-600">{summary.currency}</span>
            </p>
          ) : (
            <p className="text-lg text-slate-600">—</p>
          )}
          {summary.changePercent != null && (
            <p
              className={cn(
                "mt-0.5 flex items-center justify-end gap-1 text-sm font-bold",
                up ? "text-emerald-400" : "text-red-400",
              )}
            >
              {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {summary.change != null ? `${summary.change > 0 ? "+" : ""}${fmt(summary.change)}` : ""}
              {" ("}
              {summary.changePercent > 0 ? "+" : ""}
              {fmt(summary.changePercent)}%{")"}
            </p>
          )}
          {summary.isMarketOpen != null && (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
              {summary.isMarketOpen ? "Market open" : "Market closed"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ data, up }: { data: WatchlistDetailData; up: boolean }) {
  return (
    <div className="space-y-4">
      {data.chart.length >= 2 && <PriceChartSection chart={data.chart} up={up} />}
      <EarningsCard
        earnings={data.earnings}
        latestEarningsReportUrl={data.latestEarningsReportUrl}
        latestEarningsReportSource={data.latestEarningsReportSource}
        latestEarningsReportDate={data.latestEarningsReportDate}
      />
      <KeyStatsGrid data={data} />
      <EmployeesCard profile={data.profile} />
      <ProfileBlock data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price chart (recharts)
// ---------------------------------------------------------------------------

function PriceChartSection({ chart, up }: { chart: ChartPoint[]; up: boolean }) {
  const color = up ? "#34d399" : "#f87171";

  const tickFormatter = (val: string) => {
    const parts = val.split("-");
    if (parts.length >= 2) return `${parts[1]}/${parts[2]?.slice(0, 2) ?? ""}`;
    return val;
  };

  const domain = useMemo(() => {
    const closes = chart.map((p) => p.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const pad = (max - min) * 0.08 || 1;
    return [min - pad, max + pad] as [number, number];
  }, [chart]);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <BarChart3 className="h-3.5 w-3.5" />
        30-Day Price
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="timestamp" tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={tickFormatter} interval="preserveStartEnd" axisLine={false} tickLine={false} />
          <YAxis domain={domain} tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "#151c28", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={formatPriceTooltip}
          />
          <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#chartFill)" dot={false} activeDot={{ r: 4, fill: color }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Earnings card
// ---------------------------------------------------------------------------

function EarningsCard({
  earnings,
  latestEarningsReportUrl,
  latestEarningsReportSource,
  latestEarningsReportDate,
}: {
  earnings: EarningsDataPoint[];
  latestEarningsReportUrl: string | null;
  latestEarningsReportSource: WatchlistDetailData["latestEarningsReportSource"];
  latestEarningsReportDate: string | null;
}) {
  if (earnings.length === 0 && !latestEarningsReportUrl) return null;

  const latest = [...earnings].reverse().find((e) => e.epsActual != null);
  const upcoming = [...earnings].find((e) => e.epsActual == null && e.epsEstimate != null);
  const safeReportUrl = sanitizeExternalUrl(latestEarningsReportUrl);

  const chartData = earnings.filter((e) => e.epsActual != null || e.epsEstimate != null);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <Calendar className="h-3.5 w-3.5" />
        Earnings
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {latest && (
            <div>
              <p className="text-[10px] text-slate-500">Last EPS</p>
              <p className="text-sm font-bold text-white">${fmt(latest.epsActual)}</p>
              {latest.surprise != null && (
                <p className={cn("text-[10px] font-bold", latest.surprise >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {latest.surprise >= 0 ? "+" : ""}{fmt(latest.surprise)}% surprise
                </p>
              )}
            </div>
          )}
          {upcoming && (
            <div>
              <p className="text-[10px] text-slate-500">Next Est.</p>
              <p className="text-sm font-bold text-white">${fmt(upcoming.epsEstimate)}</p>
              <p className="text-[10px] text-slate-500">{upcoming.date}</p>
            </div>
          )}
        </div>

        {latestEarningsReportUrl ? (
          <div className="flex min-w-[180px] flex-col items-start gap-1">
            {safeReportUrl ? (
              <a
                href={safeReportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand/25 bg-brand/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand transition hover:border-brand/40 hover:bg-brand/15"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Latest earnings report
              </a>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <ExternalLink className="h-3.5 w-3.5" />
                Latest earnings report
              </div>
            )}
            {(latestEarningsReportSource || latestEarningsReportDate) && (
              <p className="text-[10px] text-slate-500">
                {[latestEarningsReportSource?.toUpperCase() ?? null, latestEarningsReportDate]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {chartData.length >= 2 && (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#151c28", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 11 }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Bar dataKey="epsEstimate" name="Estimate" fill="#64748b" radius={[3, 3, 0, 0]} barSize={14} />
            <Bar dataKey="epsActual" name="Actual" fill="#10b981" radius={[3, 3, 0, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key stats grid
// ---------------------------------------------------------------------------

function KeyStatsGrid({ data }: { data: WatchlistDetailData }) {
  const { stats } = data;
  const items: Array<{ label: string; value: string }> = [];

  if (stats.open != null) items.push({ label: "Open", value: `$${fmt(stats.open)}` });
  if (stats.high != null) items.push({ label: "High", value: `$${fmt(stats.high)}` });
  if (stats.low != null) items.push({ label: "Low", value: `$${fmt(stats.low)}` });
  if (stats.previousClose != null) items.push({ label: "Prev Close", value: `$${fmt(stats.previousClose)}` });
  if (stats.fiftyTwoWeekHigh != null) items.push({ label: "52w High", value: `$${fmt(stats.fiftyTwoWeekHigh)}` });
  if (stats.fiftyTwoWeekLow != null) items.push({ label: "52w Low", value: `$${fmt(stats.fiftyTwoWeekLow)}` });
  if (stats.volume != null) items.push({ label: "Volume", value: fmtVol(stats.volume) });
  if (stats.averageVolume != null) items.push({ label: "Avg Volume", value: fmtVol(stats.averageVolume) });
  if (stats.marketCap != null) items.push({ label: "Market Cap", value: `$${fmtBig(stats.marketCap)}` });
  if (stats.pe != null) items.push({ label: "P/E (TTM)", value: fmt(stats.pe) });
  if (stats.forwardPe != null) items.push({ label: "Forward P/E", value: fmt(stats.forwardPe) });
  if (stats.eps != null) items.push({ label: "EPS (TTM)", value: `$${fmt(stats.eps)}` });
  if (stats.beta != null) items.push({ label: "Beta", value: fmt(stats.beta) });
  if (stats.dividendYield != null) items.push({ label: "Div Yield", value: fmtPct(stats.dividendYield) });
  if (stats.profitMargin != null) items.push({ label: "Profit Margin", value: fmtPct(stats.profitMargin) });
  if (stats.revenueGrowth != null) items.push({ label: "Revenue Growth", value: fmtPct(stats.revenueGrowth) });

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5">
      <h4 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">Key Stats</h4>
      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3">
        {items.map((s) => (
          <div key={s.label}>
            <p className="text-[10px] text-slate-500">{s.label}</p>
            <p className="text-[13px] font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employees card
// ---------------------------------------------------------------------------

function EmployeesCard({ profile }: { profile: WatchlistDetailData["profile"] }) {
  if (!profile.employees && !profile.ceo) return null;
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <Users className="h-3.5 w-3.5" />
        Leadership
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {profile.ceo && (
          <div>
            <p className="text-[10px] text-slate-500">CEO</p>
            <p className="text-sm font-bold text-white">{profile.ceo}</p>
          </div>
        )}
        {profile.employees != null && (
          <div>
            <p className="text-[10px] text-slate-500">Employees</p>
            <p className="text-sm font-bold text-white">{profile.employees.toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileBlock({ data }: { data: WatchlistDetailData }) {
  const { profile } = data;
  const hasProfile = profile.sector || profile.industry || profile.country || profile.website || profile.description;
  const safeWebsiteUrl = sanitizeExternalUrl(profile.website);
  const websiteLabel = profile.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "";
  if (!hasProfile) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <Building2 className="h-3.5 w-3.5" />
        About
      </div>
      <div className="space-y-2.5">
        {(profile.sector || profile.industry) && (
          <div className="flex flex-wrap gap-2">
            {profile.sector && (
              <span className="rounded-lg bg-brand/10 px-2.5 py-1 text-[11px] font-bold text-brand">{profile.sector}</span>
            )}
            {profile.industry && (
              <span className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-400">{profile.industry}</span>
            )}
          </div>
        )}
        {profile.country && (
          <div className="flex items-center gap-1.5 text-sm text-slate-400">
            <Globe className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            {profile.country}
          </div>
        )}
        {profile.website && (
          safeWebsiteUrl ? (
            <a
              href={safeWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-brand transition hover:text-brand-strong"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {websiteLabel}
            </a>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-sm text-slate-400">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {websiteLabel}
            </div>
          )
        )}
        {profile.description && (
          <p className="text-[12px] leading-relaxed text-slate-400">{profile.description}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financials tab
// ---------------------------------------------------------------------------

function FinancialsTab({ data }: { data: WatchlistDetailData }) {
  const { financials, earnings } = data;

  if (financials.length === 0 && earnings.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6 text-center">
        <p className="text-sm text-slate-500">Financial data is not available for this symbol.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RevenueIncomeChart financials={financials} />
      <DebtCashChart financials={financials} />
      <EarningsVsEstimateChart earnings={earnings} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue / Net Income chart
// ---------------------------------------------------------------------------

function RevenueIncomeChart({ financials }: { financials: FinancialDataPoint[] }) {
  const hasData = financials.some((f) => f.revenue != null || f.netIncome != null);
  if (!hasData) return null;

  const chartData = financials.map((f) => ({
    date: f.fiscalDate,
    Revenue: f.revenue,
    "Net Income": f.netIncome,
  }));

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <DollarSign className="h-3.5 w-3.5" />
        Revenue &amp; Net Income
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={(v: number) => fmtBig(v)} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "#151c28", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 11 }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={formatFinancialTooltip}
          />
          <Bar dataKey="Revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={16} />
          <Bar dataKey="Net Income" fill="#10b981" radius={[3, 3, 0, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debt / Cash / FCF chart
// ---------------------------------------------------------------------------

function DebtCashChart({ financials }: { financials: FinancialDataPoint[] }) {
  const hasData = financials.some((f) => f.totalDebt != null || f.totalCash != null || f.freeCashFlow != null);
  if (!hasData) return null;

  const chartData = financials.map((f) => ({
    date: f.fiscalDate,
    Debt: f.totalDebt,
    Cash: f.totalCash,
    FCF: f.freeCashFlow,
  }));

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <BarChart3 className="h-3.5 w-3.5" />
        Debt, Cash &amp; Free Cash Flow
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={(v: number) => fmtBig(v)} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "#151c28", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 11 }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={formatFinancialTooltip}
          />
          <Bar dataKey="Debt" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={12} />
          <Bar dataKey="Cash" fill="#10b981" radius={[3, 3, 0, 0]} barSize={12} />
          <Bar dataKey="FCF" fill="#8b5cf6" radius={[3, 3, 0, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Earnings actual vs estimate
// ---------------------------------------------------------------------------

function EarningsVsEstimateChart({ earnings }: { earnings: EarningsDataPoint[] }) {
  const chartData = earnings.filter((e) => e.epsActual != null || e.epsEstimate != null);
  if (chartData.length < 2) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <Calendar className="h-3.5 w-3.5" />
        EPS: Actual vs Estimate
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "#151c28", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 11 }}
            labelStyle={{ color: "#94a3b8" }}
          />
          <Bar dataKey="epsEstimate" name="Estimate" fill="#64748b" radius={[3, 3, 0, 0]} barSize={14} />
          <Bar dataKey="epsActual" name="Actual" fill="#10b981" radius={[3, 3, 0, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
