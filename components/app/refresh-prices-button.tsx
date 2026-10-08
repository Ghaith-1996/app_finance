"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { refreshPortfolioPricingSnapshot } from "@/lib/actions/portfolio";
import type { PortfolioPricingRefreshResult } from "@/lib/types";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RefreshPricesButtonProps = {
  portfolioId: string;
  className?: string;
  containerClassName?: string;
  statusClassName?: string;
  onRefreshed?: (result: PortfolioPricingRefreshResult) => void;
} & (
  | { presentation?: "full"; includeHoldings?: boolean }
  | { presentation: "inline"; includeHoldings?: never }
);

function feedbackToneClass(status: PortfolioPricingRefreshResult["status"]) {
  switch (status) {
    case "updated":
      return "text-emerald-400";
    case "partial":
    case "no_quotes":
      return "text-amber-400";
    case "error":
      return "text-red-400";
  }
}

export function RefreshPricesButton({
  portfolioId,
  className,
  containerClassName,
  statusClassName,
  presentation = "full",
  includeHoldings = false,
  onRefreshed,
}: RefreshPricesButtonProps) {
  const isInline = presentation === "inline";
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<PortfolioPricingRefreshResult | null>(null);
  const router = useRouter();

  async function handleRefresh() {
    setLoading(true);
    setFeedback(null);

    try {
      const result = isInline
        ? await refreshPortfolioPricingSnapshot(portfolioId)
        : await refreshPortfolioPricingSnapshot(portfolioId, { includeHoldings });
      const missingExpectedPayload =
        result.status === "updated" &&
        (result.overview == null ||
          (!isInline && includeHoldings && result.holdings == null));

      if (missingExpectedPayload) {
        setFeedback({
          ...result,
          status: "updated",
          message: "Prices refreshed. Updating view…",
        });
        router.refresh();
        return;
      }

      onRefreshed?.(result);
      setFeedback(result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        isInline ? "flex items-center gap-2" : "flex flex-col items-start gap-2",
        containerClassName,
      )}
    >
      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        aria-label={isInline ? "Refresh prices" : undefined}
        className={cn(
          buttonStyles({
            variant: isInline ? "ghost" : "secondary",
            className: isInline
              ? "h-7 gap-1.5 px-2 text-[11px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-60"
              : "disabled:opacity-70",
          }),
          className,
        )}
      >
        <RefreshCw
          className={cn(
            isInline ? "h-3.5 w-3.5" : "mr-2 h-4 w-4",
            loading && "animate-spin",
          )}
        />
        {loading
          ? (isInline ? "Refreshing..." : "Refreshing…")
          : (isInline ? "Refresh" : "Refresh prices")}
      </button>
      {feedback?.message ? (
        <span
          className={cn(
            isInline ? "text-[11px] font-medium" : "text-xs font-medium",
            feedbackToneClass(feedback.status),
            statusClassName,
          )}
        >
          {feedback.message}
        </span>
      ) : null}
    </div>
  );
}
