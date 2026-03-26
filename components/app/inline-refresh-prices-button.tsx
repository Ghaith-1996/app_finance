"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { refreshPortfolioPricingSnapshot } from "@/lib/actions/portfolio";
import type { PortfolioPricingRefreshResult } from "@/lib/types";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InlineRefreshPricesButtonProps = {
  portfolioId: string;
  className?: string;
  containerClassName?: string;
  statusClassName?: string;
  onRefreshed?: (result: PortfolioPricingRefreshResult) => void;
};

function feedbackToneClass(status: PortfolioPricingRefreshResult["status"]) {
  switch (status) {
    case "updated":
      return "text-emerald-400";
    case "no_quotes":
      return "text-amber-400";
    case "error":
      return "text-red-400";
  }
}

export function InlineRefreshPricesButton({
  portfolioId,
  className,
  containerClassName,
  statusClassName,
  onRefreshed,
}: InlineRefreshPricesButtonProps) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<PortfolioPricingRefreshResult | null>(null);
  const router = useRouter();

  async function handleRefresh() {
    setLoading(true);
    setFeedback(null);

    try {
      const result = await refreshPortfolioPricingSnapshot(portfolioId);
      const missingExpectedOverview =
        result.status === "updated" && result.overview == null;

      if (missingExpectedOverview) {
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
    <div className={cn("flex items-center gap-2", containerClassName)}>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        aria-label="Refresh prices"
        className={cn(
          buttonStyles({
            variant: "ghost",
            className:
              "h-7 gap-1.5 px-2 text-[11px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-60",
          }),
          className,
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        {loading ? "Refreshing..." : "Refresh"}
      </button>
      {feedback?.message ? (
        <span
          className={cn(
            "text-[11px] font-medium",
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
