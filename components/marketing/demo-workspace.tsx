"use client";

import { useEffect, useMemo, useState } from "react";

import {
  BellRing,
  Bot,
  CheckCircle2,
  CircleAlert,
  MessageSquare,
  Newspaper,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { holdings, newsFeed, portfolioInsights } from "@/lib/mock-data";
import type { Holding, NewsItem } from "@/lib/types";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type DemoCaseId = "daily-brief" | "article-impact" | "adviser" | "guardrails";

type AdvisorPrompt = {
  label: string;
  prompt: string;
  answerSections: Array<{
    title: string;
    body: string;
    items?: string[];
  }>;
  connected: string[];
};

const demoCases: Array<{
  id: DemoCaseId;
  icon: typeof Newspaper;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: "daily-brief",
    icon: BellRing,
    eyebrow: "Morning workflow",
    title: "Start with what changed overnight",
    description:
      "A ranked brief explains the top stories, connected holdings, and the current portfolio move.",
  },
  {
    id: "article-impact",
    icon: Newspaper,
    eyebrow: "Story workflow",
    title: "Click a story and see portfolio impact",
    description:
      "Open a headline, review affected holdings, then continue into a focused article chat.",
  },
  {
    id: "adviser",
    icon: Bot,
    eyebrow: "Advisor workflow",
    title: "Ask why the account is moving",
    description:
      "Use predefined investor questions to see how answers stay grounded in holdings and news.",
  },
  {
    id: "guardrails",
    icon: ShieldCheck,
    eyebrow: "Risk workflow",
    title: "Spot exposure before it becomes a surprise",
    description:
      "Use allocation and catalyst checks to decide what deserves attention before the close.",
  },
];

const advisorPrompts: AdvisorPrompt[] = [
  {
    label: "Why moving?",
    prompt: "Why is my portfolio moving more than the market today?",
    connected: ["NVDA", "MSFT", "XOM"],
    answerSections: [
      {
        title: "Short read",
        body:
          "The sample portfolio is outperforming because the strongest story today maps directly to its largest weights. NVIDIA and Microsoft are both tied to the cloud and AI infrastructure headline, while Exxon is the main offset as energy cools.",
      },
      {
        title: "What changed",
        body:
          "The Reuters cloud-spending story is not just generic tech news for this account. It connects to Azure demand through Microsoft and GPU capacity demand through NVIDIA, which together represent the largest concentration in the portfolio.",
        items: [
          "NVDA is the biggest single weight, so even a modest positive move has an outsized portfolio effect.",
          "MSFT adds a second leg to the same theme through cloud infrastructure and enterprise AI distribution.",
          "XOM is moving the other way, which matters because it normally acts as a macro and inflation hedge.",
        ],
      },
      {
        title: "What to watch next",
        body:
          "The important follow-up is whether this remains an earnings-quality signal or becomes a valuation-risk signal. If cloud capex keeps rising without margin pressure, the setup supports the portfolio. If the market starts worrying about overspending, the same exposure can reverse quickly.",
      },
    ],
  },
  {
    label: "What matters?",
    prompt: "What should I read first before the close?",
    connected: ["MSFT", "NVDA"],
    answerSections: [
      {
        title: "Read this first",
        body:
          "Start with the cloud spending story because it has the highest match score and touches the two holdings that drive the most portfolio value: NVIDIA and Microsoft.",
      },
      {
        title: "Why it outranks the other headlines",
        body:
          "The oil headline matters, but it is a cross-current rather than the main driver. The healthcare story is constructive for Lilly, but it affects a smaller part of the account. The cloud story combines size, relevance, and immediacy.",
        items: [
          "It supports the main portfolio theme: AI infrastructure demand.",
          "It affects both a chip supplier and a cloud platform, so the signal is broader than one ticker.",
          "It helps explain today’s move and also informs the next earnings-cycle thesis.",
        ],
      },
      {
        title: "Decision framing",
        body:
          "This is not automatically a buy or sell signal. The practical use is prioritization: read the story, check whether it strengthens or weakens your thesis, then compare the position size against the concentration risk.",
      },
    ],
  },
  {
    label: "Risk check",
    prompt: "Where am I most concentrated right now?",
    connected: ["NVDA", "MSFT"],
    answerSections: [
      {
        title: "Largest shared exposure",
        body:
          "AI infrastructure is the dominant theme. NVIDIA and Microsoft are different businesses, but today the market is treating them as part of the same demand chain: more cloud spending, more compute buildout, and more enterprise AI workloads.",
      },
      {
        title: "Why that matters",
        body:
          "That concentration is useful when the catalyst is positive, but it reduces diversification when the narrative changes. A slowdown in cloud capex, a margin warning from hyperscalers, or concern about GPU supply/demand can pressure both holdings at once.",
        items: [
          "NVDA carries direct semiconductor and valuation sensitivity.",
          "MSFT carries cloud-growth and AI monetization expectations.",
          "The shared theme is bigger than either single ticker.",
        ],
      },
      {
        title: "Practical guardrail",
        body:
          "Before adding to either position, compare the combined AI infrastructure weight against your comfort level. If the thesis is still intact but the weight is too high, the next move may be trimming risk elsewhere rather than increasing exposure.",
      },
    ],
  },
];

function caseFromHash(hash: string): DemoCaseId | null {
  const normalized = hash.replace("#", "").trim();
  return demoCases.some((item) => item.id === normalized)
    ? (normalized as DemoCaseId)
    : null;
}

function holdingValue(holding: Holding): number {
  if (holding.currentValue > 0) return holding.currentValue;
  return holding.quantity * (holding.currentPrice || holding.price || 0);
}

function getPortfolioStats() {
  const totalValue = holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
  const dayGain = holdings.reduce(
    (sum, holding) => sum + holdingValue(holding) * (holding.dailyChange / 100),
    0,
  );
  const previousValue = totalValue - dayGain;

  return {
    totalValue,
    dayGain,
    dayGainPercent: previousValue > 0 ? (dayGain / previousValue) * 100 : 0,
  };
}

function matchHoldings(story: NewsItem): Holding[] {
  const symbols = new Set([
    ...(story.holdings ?? []),
    ...(story.matchedStockTags ?? []),
  ]);
  return holdings.filter((holding) => symbols.has(holding.symbol));
}

export function DemoWorkspace() {
  const [activeCase, setActiveCase] = useState<DemoCaseId>("daily-brief");
  const [selectedStoryId, setSelectedStoryId] = useState(newsFeed[0]?.id ?? "");
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const portfolioStats = useMemo(() => getPortfolioStats(), []);

  useEffect(() => {
    const applyHash = () => {
      const next = caseFromHash(window.location.hash);
      if (next) setActiveCase(next);
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  function selectCase(id: DemoCaseId) {
    setActiveCase(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  const selectedStory =
    newsFeed.find((story) => story.id === selectedStoryId) ?? newsFeed[0]!;
  const selectedPrompt = advisorPrompts[selectedPromptIndex]!;

  return (
    <div className="mx-auto grid max-w-[90rem] gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <Panel className="space-y-4 p-5">
          <Badge tone="brand">Sample portfolio</Badge>
          <div>
            <p className="text-3xl font-semibold tracking-tight text-white">
              {formatCurrency(portfolioStats.totalValue)}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {formatPercent(portfolioStats.dayGainPercent)} today,
              {" "}
              {formatCurrency(portfolioStats.dayGain)} in sample gains.
            </p>
          </div>
          <div className="grid gap-2">
            {holdings.slice(0, 5).map((holding) => (
              <div
                key={holding.id}
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{holding.symbol}</p>
                  <p className="text-xs text-slate-500">{holding.company}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">
                    {holding.allocation}%
                  </p>
                  <p
                    className={cn(
                      "text-xs font-semibold",
                      holding.dailyChange >= 0 ? "text-brand" : "text-red-400",
                    )}
                  >
                    {formatPercent(holding.dailyChange)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid gap-3">
          {demoCases.map((item) => {
            const Icon = item.icon;
            const active = activeCase === item.id;

            return (
              <button
                key={item.id}
                type="button"
                id={item.id}
                onClick={() => selectCase(item.id)}
                className="text-left"
              >
                <Panel
                  className={cn(
                    "space-y-3 p-4 transition",
                    active
                      ? "border-brand/30 bg-brand/[0.05]"
                      : "hover:border-white/10 hover:bg-surface-hover",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "rounded-xl p-2",
                        active ? "bg-brand/15 text-brand" : "bg-white/5 text-slate-500",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {item.eyebrow}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">{item.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {item.description}
                    </p>
                  </div>
                </Panel>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="min-w-0">
        {activeCase === "daily-brief" ? (
          <DailyBriefDemo
            portfolioStats={portfolioStats}
            selectedStoryId={selectedStoryId}
            onSelectStory={(id) => {
              setSelectedStoryId(id);
              selectCase("article-impact");
            }}
          />
        ) : null}

        {activeCase === "article-impact" ? (
          <ArticleImpactDemo
            story={selectedStory}
            selectedStoryId={selectedStoryId}
            onSelectStory={setSelectedStoryId}
          />
        ) : null}

        {activeCase === "adviser" ? (
          <AdvisorDemo
            selectedPrompt={selectedPrompt}
            selectedPromptIndex={selectedPromptIndex}
            onSelectPrompt={setSelectedPromptIndex}
          />
        ) : null}

        {activeCase === "guardrails" ? (
          <GuardrailsDemo portfolioStats={portfolioStats} />
        ) : null}
      </section>
    </div>
  );
}

function DailyBriefDemo({
  portfolioStats,
  selectedStoryId,
  onSelectStory,
}: {
  portfolioStats: ReturnType<typeof getPortfolioStats>;
  selectedStoryId: string;
  onSelectStory: (id: string) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Panel glow className="space-y-6 p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge tone="brand">9:00 AM brief</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white lg:text-4xl">
              Your portfolio is up because AI infrastructure is leading.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
              The demo ranks the same market news differently once it knows the
              account owns NVIDIA, Microsoft, Lilly, Visa, and Exxon.
            </p>
          </div>
          <div className="rounded-2xl border border-brand/20 bg-brand/10 px-5 py-4 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              Today
            </p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {formatPercent(portfolioStats.dayGainPercent)}
            </p>
            <p className="text-sm text-slate-400">
              {formatCurrency(portfolioStats.dayGain)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {portfolioInsights.map((insight) => (
            <div
              key={insight.title}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {insight.title}
              </p>
              <p className="mt-3 text-lg font-semibold text-white">{insight.value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{insight.detail}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {newsFeed.slice(0, 4).map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => onSelectStory(story.id)}
              className="w-full text-left"
            >
              <StoryRow story={story} selected={story.id === selectedStoryId} />
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="space-y-5 p-6">
        <div className="flex items-center gap-3">
          <WalletCards className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold text-white">Why this is useful</h2>
        </div>
        <div className="space-y-4">
          {[
            "Shows the account move before showing generic market noise.",
            "Ranks stories by relevance to actual holdings.",
            "Explains both the upside catalyst and the offsetting risks.",
          ].map((item) => (
            <div key={item} className="flex gap-3 text-sm leading-6 text-slate-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ArticleImpactDemo({
  story,
  selectedStoryId,
  onSelectStory,
}: {
  story: NewsItem;
  selectedStoryId: string;
  onSelectStory: (id: string) => void;
}) {
  const affectedHoldings = matchHoldings(story);

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Panel className="space-y-3 p-5">
        <Badge tone="neutral">Choose a story</Badge>
        {newsFeed.slice(0, 5).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectStory(item.id)}
            className="w-full text-left"
          >
            <StoryRow story={item} selected={item.id === selectedStoryId} compact />
          </button>
        ))}
      </Panel>

      <Panel glow className="space-y-6 p-6 lg:p-8">
        <div>
          <Badge tone="brand">{story.relevanceScore}% portfolio match</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
            {story.headline}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {story.source} - {story.publishedAt}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Why it matters
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {story.whyItMatters || story.aiSummary || story.globalSummary}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                AI summary
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {story.aiSummary || story.globalSummary}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Affected holdings
            </p>
            {affectedHoldings.map((holding) => (
              <div
                key={holding.id}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{holding.symbol}</p>
                    <p className="text-sm text-slate-500">{holding.company}</p>
                  </div>
                  <Badge tone={holding.dailyChange >= 0 ? "success" : "danger"}>
                    {formatPercent(holding.dailyChange)}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {holding.thesis}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-brand/20 bg-brand/[0.06] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-brand">
            <MessageSquare className="h-4 w-4" />
            Article chat
          </div>
          <div className="mt-4 space-y-3">
            <p className="ml-auto max-w-xl rounded-2xl border border-brand/20 bg-brand/10 px-4 py-3 text-sm text-white">
              What is the main risk here for my portfolio?
            </p>
            <div className="max-w-3xl space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
              <p>
                The main risk is not the headline itself. The headline is
                positive for the portfolio because it supports cloud spending,
                AI infrastructure demand, and enterprise software budgets. The
                risk is that the portfolio has multiple positions tied to the
                same theme.
              </p>
              <div>
                <p className="font-semibold text-white">Portfolio impact</p>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  <li>
                    MSFT benefits through Azure demand and enterprise AI
                    adoption, so the story supports the second-largest holding.
                  </li>
                  <li>
                    NVDA benefits through GPU capacity demand, which is more
                    direct but also more sensitive to valuation and capex
                    expectations.
                  </li>
                  <li>
                    Because both holdings respond to the same infrastructure
                    narrative, a reversal in that narrative could affect both at
                    the same time.
                  </li>
                </ul>
              </div>
              <p>
                The useful follow-up is to watch whether future articles confirm
                demand quality or shift toward spending discipline. If the next
                wave of news talks about margin pressure, delayed data-center
                spend, or lower AI monetization, this same exposure becomes a
                risk factor instead of only a growth driver.
              </p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function AdvisorDemo({
  selectedPrompt,
  selectedPromptIndex,
  onSelectPrompt,
}: {
  selectedPrompt: AdvisorPrompt;
  selectedPromptIndex: number;
  onSelectPrompt: (index: number) => void;
}) {
  return (
    <Panel glow className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge tone="brand">Portfolio advisor</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
            Ask questions that start from the portfolio.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            This demo shows the difference between a generic chatbot and one
            that already knows positions, weights, and matched stories.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {advisorPrompts.map((prompt, index) => (
            <Button
              key={prompt.label}
              type="button"
              variant={index === selectedPromptIndex ? "primary" : "secondary"}
              onClick={() => onSelectPrompt(index)}
              className="h-10 px-4"
            >
              {prompt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-brand/20 bg-brand/[0.06] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              Prompt
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {selectedPrompt.prompt}
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Answer
            </p>
            <div className="mt-4 space-y-4">
              {selectedPrompt.answerSections.map((section) => (
                <div
                  key={section.title}
                  className="rounded-2xl border border-white/[0.06] bg-[#0b1118]/55 p-4"
                >
                  <p className="text-sm font-semibold text-white">
                    {section.title}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    {section.body}
                  </p>
                  {section.items ? (
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-400">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Grounded context
          </p>
          {selectedPrompt.connected.map((symbol) => {
            const holding = holdings.find((item) => item.symbol === symbol);
            if (!holding) return null;
            return (
              <div
                key={symbol}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">{holding.symbol}</p>
                  <p className="text-sm font-semibold text-brand">
                    {holding.allocation}%
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {holding.thesis}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function GuardrailsDemo({
  portfolioStats,
}: {
  portfolioStats: ReturnType<typeof getPortfolioStats>;
}) {
  const concentration = holdings
    .slice()
    .sort((a, b) => b.allocation - a.allocation)
    .slice(0, 3);

  return (
    <Panel glow className="space-y-6 p-6 lg:p-8">
      <div>
        <Badge tone="warning">Guardrails</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
          Find the positions that deserve a second look.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          Pulsefolio does not need to trade for the user. A useful version can
          simply reveal concentration, catalysts, and risk before decisions.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GuardrailCard
          icon={TrendingUp}
          tone="brand"
          title="Portfolio value"
          value={formatCurrency(portfolioStats.totalValue)}
          detail={`${formatPercent(portfolioStats.dayGainPercent)} today from weighted holding moves.`}
        />
        <GuardrailCard
          icon={CircleAlert}
          tone="warning"
          title="Concentration"
          value="AI infrastructure"
          detail="NVDA and MSFT are the two largest weights and share the same primary catalyst."
        />
        <GuardrailCard
          icon={ShieldCheck}
          tone="success"
          title="Offset"
          value="Healthcare + energy"
          detail="LLY and XOM reduce pure technology exposure, but macro news still matters."
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Largest exposure
          </p>
          {concentration.map((holding) => (
            <div
              key={holding.id}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{holding.symbol}</p>
                  <p className="text-sm text-slate-500">{holding.company}</p>
                </div>
                <p className="text-lg font-semibold text-white">{holding.allocation}%</p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${holding.allocation}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
            <Sparkles className="h-4 w-4" />
            Next best action
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Read the AI infrastructure story first, then check whether the
            exposure still fits the desired risk level. The demo points to the
            decision, not just the headline.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function StoryRow({
  story,
  selected,
  compact = false,
}: {
  story: NewsItem;
  selected: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white/[0.03] transition",
        compact ? "p-3" : "p-4",
        selected ? "border-brand/30 bg-brand/[0.06]" : "border-white/[0.06]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold leading-6 text-white">
            {story.headline}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {story.source} - {story.publishedAt}
          </p>
        </div>
        <Badge tone="brand" className="shrink-0">
          {story.relevanceScore}%
        </Badge>
      </div>
      {!compact ? (
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {story.aiSummary || story.globalSummary}
        </p>
      ) : null}
    </div>
  );
}

function GuardrailCard({
  icon: Icon,
  tone,
  title,
  value,
  detail,
}: {
  icon: typeof TrendingUp;
  tone: "brand" | "success" | "warning";
  title: string;
  value: string;
  detail: string;
}) {
  const toneClass =
    tone === "warning"
      ? "bg-amber-500/10 text-amber-400"
      : "bg-brand/10 text-brand";

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
      <div className={cn("inline-flex rounded-xl p-3", toneClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
    </div>
  );
}
