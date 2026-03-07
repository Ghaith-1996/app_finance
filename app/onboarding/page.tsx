"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import {
  ArrowRight,
  Link2,
  PencilLine,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { ProviderCard } from "@/components/app/provider-card";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { manualPortfolioSeed, providers } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type Method = "connect" | "manual";

const extraHolding = {
  id: "cost-live",
  symbol: "COST",
  company: "Costco Wholesale",
  sector: "Consumer",
  market: "NASDAQ",
  source: "Manual",
  price: 749.12,
  dailyChange: 0.9,
  allocation: 8,
  thesis: "Quality consumer compounder with defensive demand.",
};

export default function OnboardingPage() {
  const [method, setMethod] = useState<Method>("connect");
  const [selectedProviderId, setSelectedProviderId] = useState("wealthsimple");
  const [draftHoldings, setDraftHoldings] = useState(manualPortfolioSeed);

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ?? providers[0];

  const totalAllocation = useMemo(
    () => draftHoldings.reduce((sum, holding) => sum + holding.allocation, 0),
    [draftHoldings],
  );

  const isAllocationBalanced = totalAllocation === 100;

  function adjustAllocation(id: string, delta: number) {
    setDraftHoldings((current) =>
      current.map((holding) =>
        holding.id === id
          ? { ...holding, allocation: Math.max(0, holding.allocation + delta) }
          : holding,
      ),
    );
  }

  function addHolding() {
    setDraftHoldings((current) => {
      if (current.some((holding) => holding.id === extraHolding.id)) {
        return current;
      }

      return [...current, extraHolding];
    });
  }

  return (
    <AppShell
      eyebrow="Onboarding"
      title="Bring your first portfolio into one intelligent home"
      description="Start with a linked account or create a portfolio manually. Either way, the user lands in the same clear, guided finance experience."
      activePath="/onboarding"
      actions={
        <>
          <Link
            href="/analysis"
            className={buttonStyles({ variant: "secondary" })}
          >
            Skip to analysis
          </Link>
          <Link href="/analysis" className={buttonStyles({ size: "lg" })}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Panel className="space-y-5 border-black/6 bg-white/84">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                  Method selection
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Let users start with the lowest-friction path, then keep the
                  rest of the product consistent after onboarding.
                </p>
              </div>
              <Badge tone="brand">
                {method === "connect" ? "method_selected" : "manual_editing"}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMethod("connect")}
                className={cn(
                  "rounded-3xl border p-5 text-left transition",
                  method === "connect"
                    ? "border-brand/28 bg-brand/10"
                    : "border-black/6 bg-white/72 hover:bg-white/84",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-2xl border border-black/6 bg-[#f7f2ea] p-3 text-brand">
                    <Link2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-slate-950">
                      Connect existing portfolio
                    </p>
                    <p className="text-sm text-slate-600">
                      Read-only broker flow with sync states and provider status.
                    </p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMethod("manual")}
                className={cn(
                  "rounded-3xl border p-5 text-left transition",
                  method === "manual"
                    ? "border-brand/28 bg-brand/10"
                    : "border-black/6 bg-white/72 hover:bg-white/84",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-2xl border border-black/6 bg-[#f7f2ea] p-3 text-brand">
                    <PencilLine className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-slate-950">
                      Create manually
                    </p>
                    <p className="text-sm text-slate-600">
                      Great for early users who want to feel the product before a
                      live integration exists.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </Panel>

          {method === "connect" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  selected={provider.id === selectedProviderId}
                  onSelect={() => setSelectedProviderId(provider.id)}
                />
              ))}
            </div>
          ) : (
            <Panel className="space-y-5 border-black/6 bg-white/84">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                    Manual portfolio builder
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    This mocked editor shows how users can shape a starter
                    portfolio before analysis begins.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addHolding}
                  className={buttonStyles({ variant: "secondary" })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add sample holding
                </button>
              </div>
              <div className="space-y-3">
                {draftHoldings.map((holding) => (
                  <div
                    key={holding.id}
                    className="flex flex-col gap-4 rounded-3xl border border-black/6 bg-[#fffdf9] p-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold text-slate-950">
                          {holding.symbol}
                        </p>
                        <Badge tone="neutral">{holding.sector}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {holding.company}
                      </p>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        {holding.thesis}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => adjustAllocation(holding.id, -2)}
                        className="rounded-full border border-black/8 bg-[#f7f2ea] px-3 py-2 text-sm text-slate-700 transition hover:bg-white hover:text-slate-950"
                      >
                        -2%
                      </button>
                      <div className="min-w-20 text-center">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Weight
                        </p>
                        <p className="mt-1 text-xl font-semibold text-slate-950">
                          {holding.allocation}%
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => adjustAllocation(holding.id, 2)}
                        className="rounded-full border border-black/8 bg-[#f7f2ea] px-3 py-2 text-sm text-slate-700 transition hover:bg-white hover:text-slate-950"
                      >
                        +2%
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel className="space-y-5 border-black/6 bg-white/84">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                  Current state
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">
                  {method === "connect"
                    ? `Ready to import from ${selectedProvider.name}`
                    : "Manual portfolio ready for validation"}
                </h2>
              </div>
              <Badge tone={isAllocationBalanced ? "success" : "warning"}>
                {isAllocationBalanced ? "validation_ready" : "validation_error"}
              </Badge>
            </div>
            {method === "connect" ? (
              <div className="space-y-3">
                {[
                  "method_selected",
                  "provider_selected",
                  "connecting",
                  "importing",
                  "success",
                ].map((state, index) => (
                  <div
                    key={state}
                    className="flex items-center justify-between rounded-2xl border border-black/6 bg-[#fffdf9] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{state}</p>
                      <p className="text-sm text-slate-600">
                        {index < 2
                          ? "Completed by the current UI state."
                          : index === 2
                            ? "Connection modal and permissions screen."
                            : index === 3
                              ? "Import progress and retry handling."
                              : "Hand off into analysis once synced."}
                      </p>
                    </div>
                    <Badge tone={index < 2 ? "success" : index === 2 ? "brand" : "neutral"}>
                      {index < 2 ? "done" : index === 2 ? "next" : "pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-3xl border border-black/6 bg-[#fffdf9] p-5">
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    Allocation total
                  </p>
                  <p className="mt-3 text-4xl font-semibold text-slate-950">
                    {totalAllocation}%
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    The manual editor makes validation states obvious before the AI
                    analysis begins.
                  </p>
                </div>
                {!isAllocationBalanced ? (
                  <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
                    <div className="flex items-center gap-3 text-amber-100">
                      <TriangleAlert className="h-5 w-5" />
                      <p className="text-sm font-semibold uppercase tracking-[0.2em]">
                        Validation message
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-amber-900">
                      Allocation should total 100% before analysis. This is where
                      inline guidance and field-level validation will appear.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </Panel>

          <Panel className="space-y-4 border-black/6 bg-white/84">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Edge states
            </p>
            <div className="space-y-3">
              <StateCard
                title="empty_portfolio_detected"
                detail="Guide the user toward manual entry or a second provider if the import returns no positions."
              />
              <StateCard
                title="sync_error"
                detail="Show a recovery path with retry text, provider detail, and a fallback demo option."
              />
              <StateCard
                title="disconnected"
                detail="Keep the feed available while marking the portfolio as stale and inviting a refresh."
              />
            </div>
            <div className="rounded-3xl border border-brand/16 bg-brand/10 p-5">
              <div className="flex items-center gap-3 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
                <p className="text-sm font-semibold uppercase tracking-[0.2em]">
                  Read-only by design
                </p>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                The UX positions broker connections as informational only, which
                sets up a clear trust story for the backend and security phase.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function StateCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-black/6 bg-[#fffdf9] p-4">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-7 text-slate-600">{detail}</p>
    </div>
  );
}
