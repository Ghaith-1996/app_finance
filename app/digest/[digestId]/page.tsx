import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { sanitizeExternalUrl } from "@/lib/security/external-url";
import { formatEtWindowLabel } from "@/lib/notifications/timezone";
import type {
  DailyDigestSnapshot,
  DigestSnapshotStory,
} from "@/lib/notifications/types";
import { loadShellChromeState } from "@/lib/server/page-loaders";
import { createClient } from "@/lib/supabase/server";

type DigestRow = {
  id: string;
  user_id: string;
  digest_date: string;
  time_zone: string;
  window_start: string;
  window_end: string;
  source_mode: "portfolio" | "watchlist";
  portfolio_id: string | null;
  portfolio_name: string | null;
  summary_line: string;
  bullish_symbols: string[] | null;
  bearish_symbols: string[] | null;
  top_stories: unknown;
  created_at: string;
};

function mapDigestRow(row: DigestRow): DailyDigestSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    digestDate: row.digest_date,
    timeZone: row.time_zone,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    sourceMode: row.source_mode,
    portfolioId: row.portfolio_id,
    portfolioName: row.portfolio_name,
    summaryLine: row.summary_line,
    bullishSymbols: row.bullish_symbols ?? [],
    bearishSymbols: row.bearish_symbols ?? [],
    topStories: Array.isArray(row.top_stories)
      ? (row.top_stories as DigestSnapshotStory[])
      : [],
    createdAt: row.created_at,
  };
}

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function serializeSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry.length > 0) {
          params.append(key, entry);
        }
      }
    }
  }

  return params.toString();
}

export default async function DigestPage({
  params,
  searchParams,
}: {
  params: Promise<{ digestId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ digestId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const search = serializeSearchParams(resolvedSearchParams);
    const redirectTarget = search
      ? `/digest/${encodeURIComponent(digestId)}?${search}`
      : `/digest/${encodeURIComponent(digestId)}`;
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTarget)}`);
  }

  const { data } = await supabase
    .from("notification_digests")
    .select("*")
    .eq("id", digestId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const digest = mapDigestRow(data as DigestRow);
  const storyParam = resolvedSearchParams.story;
  const activeStoryId =
    typeof storyParam === "string"
      ? storyParam.trim()
      : Array.isArray(storyParam)
        ? storyParam[0]?.trim() ?? ""
        : "";
  const { showOnboardingNav, showAdminLink } = await loadShellChromeState();

  return (
    <AppShell
      eyebrow="Morning digest"
      title="Stored overnight snapshot"
      description={
        digest.sourceMode === "portfolio" && digest.portfolioName
          ? `Saved from ${digest.portfolioName}.`
          : "Saved from your watchlist-only overnight matches."
      }
      activePath="/feed"
      backHref="/feed"
      backLabel="Back to feed"
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
    >
      <div className="space-y-6">
        <Panel className="space-y-4 rounded-[2rem]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Window
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                {formatEtWindowLabel(digest.windowStart, digest.windowEnd)}
              </h2>
              <p className="text-sm leading-7 text-slate-400">
                {digest.summaryLine}
              </p>
            </div>
            <Badge tone="brand">
              {digest.topStories.length} stored stor{digest.topStories.length === 1 ? "y" : "ies"}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">
              Bullish: {digest.bullishSymbols.join(", ") || "none"}
            </Badge>
            <Badge tone="neutral">
              Bearish: {digest.bearishSymbols.join(", ") || "none"}
            </Badge>
          </div>
        </Panel>

        <div className="space-y-4">
          {digest.topStories.map((story, index) => {
            const safeStoryUrl = sanitizeExternalUrl(story.url);

            return (
              <Panel
                key={story.newsItemId}
                id={`story-${story.newsItemId}`}
                className={
                  story.newsItemId === activeStoryId
                    ? "rounded-[2rem] border-brand/40 bg-brand/5"
                    : "rounded-[2rem]"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                      <span>#{index + 1}</span>
                      <span>{story.source}</span>
                      <span>{formatPublishedAt(story.publishedAt)}</span>
                    </div>
                    <h3 className="text-xl font-semibold tracking-tight text-white">
                      {story.headline}
                    </h3>
                    <p className="text-sm leading-7 text-slate-400">
                      {story.aiSummary || story.whyItMatters || "No stored summary for this story."}
                    </p>
                  </div>

                  <div className="space-y-2 text-right">
                    {story.relevanceScore != null ? (
                      <Badge tone="brand">
                        Match {Math.round(story.relevanceScore)}
                      </Badge>
                    ) : null}
                    <Badge tone="neutral">
                      {story.displayEffect}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                  <span>Matched: {story.matchedSymbols.join(", ") || "General market"}</span>
                  {safeStoryUrl ? (
                    <a
                      href={safeStoryUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-brand underline underline-offset-2 hover:text-brand-strong"
                    >
                      Open source article
                    </a>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
