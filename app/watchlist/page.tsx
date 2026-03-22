import Link from "next/link";

import {
  ArrowRight,
  MoreVertical,
  Newspaper,
  Plus,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { AppShell } from "@/components/app/app-shell";

export default function WatchlistPage() {
  const watchlist = [
    {
      id: "1",
      symbol: "AAPL",
      company: "Apple Inc.",
      exchange: "NASDAQ",
      price: 189.43,
      dayChange: 1.24,
    },
    {
      id: "2",
      symbol: "BTC",
      company: "Bitcoin",
      exchange: "CRYPTO",
      price: 64210.12,
      dayChange: -0.82,
    },
    {
      id: "3",
      symbol: "NVDA",
      company: "NVIDIA Corp.",
      exchange: "NASDAQ",
      price: 892.2,
      dayChange: 4.15,
    },
  ];

  return (
    <AppShell
      eyebrow=""
      title="Watchlist"
      description="Track symbols and open the news feed for any asset in one click."
      activePath="/portfolio"
      backHref="/portfolio"
      actions={
        <button className="flex items-center gap-2 rounded-full bg-[#00B86F] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#00a865]">
          <Plus className="h-4 w-4" />
          Add to Watchlist
        </button>
      }
    >
      <div className="-mt-8 mb-8 flex items-center gap-3">
        <span className="inline-flex items-center rounded-full bg-[#E8F8ED] px-2.5 py-1 text-[10px] font-bold tracking-widest text-[#009B5A]">
          ACTIVE MONITOR
        </span>
        <span className="text-sm font-medium text-slate-500">Updated 2m ago</span>
      </div>

      <div className="flex flex-col gap-10 lg:flex-row">
        {/* Main List */}
        <div className="flex-1 space-y-4">
          <div className="grid grid-cols-[2fr_1fr_auto] items-center gap-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <div>ASSET</div>
            <div>PERFORMANCE</div>
            <div className="text-right">STATUS</div>
          </div>

          <div className="space-y-3">
            {watchlist.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[2fr_1fr_auto] items-center gap-4 rounded-[1.5rem] border border-black/5 bg-white px-6 py-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
              >
                {/* Asset */}
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-[#F2F4F7] text-lg font-bold text-[#475467]">
                    {item.company.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-[15px]">{item.company}</p>
                    <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                      {item.symbol} · {item.exchange}
                    </p>
                  </div>
                </div>

                {/* Performance */}
                <div>
                  <p className="font-bold text-slate-900 text-[15px]">
                    ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p
                    className={`flex items-center gap-1 text-[13px] font-bold mt-0.5 ${
                      item.dayChange >= 0 ? "text-[#00B86F]" : "text-[#FF6B6B]"
                    }`}
                  >
                    {item.dayChange >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {item.dayChange > 0 ? "+" : ""}
                    {item.dayChange}%
                  </p>
                </div>

                {/* Status / actions */}
                <div className="flex items-center justify-end gap-2 sm:gap-3">
                  <Link
                    href={`/feed?symbol=${encodeURIComponent(item.symbol)}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#00B86F]/35 bg-[#E8F8ED]/60 px-3 py-2 text-[11px] font-bold text-[#009B5A] transition hover:border-[#00B86F]/55 hover:bg-[#E8F8ED]"
                  >
                    <Newspaper className="h-3.5 w-3.5" />
                    News
                  </Link>
                  <button
                    type="button"
                    className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
                    aria-label="More options"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-200/60 bg-slate-50/50 py-12 transition-colors hover:border-slate-300/60">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm border border-slate-100">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <p className="text-[13px] font-medium text-slate-500">
              Add more assets to monitor and jump to news in one tap
            </p>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-full lg:w-[340px] space-y-6 shrink-0">
          {/* Market Movers */}
          <div className="overflow-hidden rounded-[2rem] bg-[#586475] p-6 text-white shadow-sm">
            <h3 className="mb-6 text-[18px] font-bold tracking-tight">Market Movers</h3>
            <div className="space-y-4">
              {[
                { symbol: "TS", name: "Tesla Inc.", change: "+5.2%" },
                { symbol: "MS", name: "MicroStrategy", change: "+12.4%" },
                { symbol: "ET", name: "Ethereum", change: "+2.1%" },
              ].map((mover, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-[10px] font-bold uppercase tracking-wider text-white">
                      {mover.symbol}
                    </div>
                    <span className="text-[14px] font-medium text-[#D1D5DB]">{mover.name}</span>
                  </div>
                  <span className="text-[14px] font-bold text-[#C0EFD8]">{mover.change}</span>
                </div>
              ))}
            </div>
            <button className="mt-8 w-full rounded-2xl bg-white/15 px-4 py-3 text-[13px] font-bold text-white transition hover:bg-white/20">
              Explore All Markets
            </button>
          </div>

          {/* Trending */}
          <div className="rounded-[2rem] bg-white p-6 shadow-sm border border-black/5">
            <p className="mb-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              TRENDING NEAR YOU
            </p>
            <div className="space-y-5">
              {[
                { name: "SOL / Solana", mentions: "420k Mentions" },
                { name: "AMD / Advanced Micro", mentions: "128k Mentions" },
                { name: "PLTR / Palantir", mentions: "95k Mentions" },
              ].map((trend, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-bold text-slate-900">{trend.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{trend.mentions}</p>
                  </div>
                  <button className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E5E7EB] text-white hover:bg-[#D1D5DB] transition">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* AI Insight */}
          <div className="rounded-[2rem] bg-[#022A1E] p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#00B86F] fill-current" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                SIGNAL AI INSIGHT
              </p>
            </div>
            <p className="text-[13px] leading-relaxed text-[#A1B2C6]">
              &quot;The current watchlist exhibits a 68% correlation to the Tech Sector. Diversification
              into Commodities is recommended to hedge against upcoming rate volatility.&quot;
            </p>
            <button className="mt-5 flex items-center gap-1 text-[12px] font-bold text-[#00B86F] hover:text-[#00c975] transition-colors">
              View Strategy Report
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}