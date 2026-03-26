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
  includeHoldings?: boolean;
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

export function RefreshPricesButton({
  portfolioId,
  className,
  containerClassName,
  statusClassName,
  includeHoldings = false,
  onRefreshed,
}: RefreshPricesButtonProps) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<PortfolioPricingRefreshResult | null>(null);
  const router = useRouter();

  async function handleRefresh() {
    setLoading(true);
    setFeedback(null);

    try {
      const result = await refreshPortfolioPricingSnapshot(portfolioId, {
        includeHoldings,
      });
      const missingExpectedPayload =
        result.status === "updated" &&
        (result.overview == null || (includeHoldings && result.holdings == null));

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
    <div className={cn("flex flex-col items-start gap-2", containerClassName)}>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        className={cn(
          buttonStyles({
            variant: "secondary",
            className: "disabled:opacity-70",
          }),
          className,
        )}
      >
        <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
        {loading ? "Refreshing…" : "Refresh prices"}
      </button>
      {feedback?.message ? (
        <span
          className={cn(
            "text-xs font-medium",
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
