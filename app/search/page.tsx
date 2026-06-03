import Link from "next/link";
import { Search } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { loadGlobalSearchPageData } from "@/lib/server/global-search";

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

function resultTone(type: string): "brand" | "success" | "warning" | "danger" | "neutral" {
  if (type === "alert") return "warning";
  if (type === "thesis") return "brand";
  if (type === "saved") return "success";
  return "neutral";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const { showOnboardingNav, showAdminLink, query, results } =
    await loadGlobalSearchPageData(rawQuery);

  return (
    <AppShell
      eyebrow="Command center"
      title="Global Search"
      description="Find tickers, saved articles, alerts, thesis notes, and recent stories from one place."
      activePath="/search"
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
    >
      <div className="space-y-6">
        <form className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4">
          <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search AAPL, margin pressure, saved article, alert..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-[#080c11] transition hover:bg-brand-strong"
            >
              Search
            </button>
          </label>
        </form>

        {query.length < 2 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-surface-raised/60 p-10 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-500" />
            <h2 className="mt-4 text-xl font-bold text-white">Search across Pulsefolio</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">
              Enter at least two characters to search holdings, watchlist symbols, articles,
              saved articles, alerts, and thesis notes.
            </p>
          </div>
        ) : results.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {results.map((result) => (
              <Link
                key={result.id}
                href={result.href}
                className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5 transition hover:border-white/10 hover:bg-surface-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge tone={resultTone(result.type)}>{result.type}</Badge>
                    <h2 className="mt-3 line-clamp-2 text-lg font-bold leading-snug text-white">
                      {result.title}
                    </h2>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    {result.meta}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">
                  {result.detail}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-surface-raised/60 p-10 text-center">
            <h2 className="text-xl font-bold text-white">No result found</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">
              Try a ticker, company name, article headline, saved risk, or alert keyword.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
